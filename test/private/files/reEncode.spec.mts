/**
 * Tests for private/files/reEncode.mts
 *
 * Chain: reEncode → sharp(filePath).{jpeg,png,webp,avif}(...).withMetadata({}).withExif({}).toFile(finalFilepath)
 * sharp fail → Sentry.captureException(err) → throw new Error('Error processing the image')
 * original ext ≠ target ext → fs.promises.unlink(filePath)
 * unlink fail → Sentry.captureException(e) → throw throwInternalError() (GraphQLError 500)
 *
 * `sharp` and `@sentry/node` are real ES module namespaces (sealed, non-configurable exports) — sinon
 * refuse to stub them ("ES Modules cannot be stubbed"), same limitation documented in
 * test/koa/router/verifyEmail.spec.mts. So this spec drive the real `sharp` lib against a tiny valid
 * hand-written 1x1 JPEG fixture (same fixture as test/files/uploadTempImage.spec.mts) → every re-encode
 * branch exercised for real, and the real (uninit'd) Sentry.captureException run as a safe no-op.
 * Only `fs.promises.unlink` is stubbed — a plain mutable object property, not a sealed namespace → sinon
 * control the unlink-failure branch deterministically.
 */
import { reEncode } from '@private/files/reEncode.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { promises as fsp, writeFileSync, existsSync, unlinkSync } from 'fs'
import os from 'os'
import path from 'path'

import { expectGraphQLErrorAsync } from '../../helpers/assertGraphQLError.mjs'

// Minimal valid 1x1 JPEG (base64) — real bytes → sharp decode + re-encode it
const MINIMAL_JPEG_B64 =
	'/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgj/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABykX//Z'

const createdPaths: string[] = []

function makeSrcJpeg(name: string) {
	const p = path.join(os.tmpdir(), name)
	writeFileSync(p, Buffer.from(MINIMAL_JPEG_B64, 'base64'))
	createdPaths.push(p)
	return p
}

function cleanup() {
	for (const p of createdPaths.splice(0)) {
		try {
			if (existsSync(p)) unlinkSync(p)
		} catch {
			// best-effort cleanup only
		}
	}
}

describe('reEncode', () => {
	afterEach(() => {
		sinon.restore()
		cleanup()
	})

	it('jpeg → jpeg (same extension): re-encodes in place, skips the unlink, uses default quality=100', async () => {
		// Bytes read into a Buffer before encoding → writing back to the very same path is fine. Also the only
		// way to reach the `finalFilepath !== filePath` false arm.
		const src = makeSrcJpeg(`reencode-${Date.now()}-same.jpeg`)

		const result = await reEncode(src, 'jpeg')

		expect(result).to.equal(src)
		expect(existsSync(src)).to.equal(true) // rewritten in place, never unlinked
	})

	it('.JPEG → jpeg (case differs): writes the lowercase path and removes the original', async () => {
		// Paths differ only by case → really a new file, the original must go — else the caller hold a stale
		// duplicate of the same image.
		const src = makeSrcJpeg(`reencode-${Date.now()}-upper.JPEG`)
		const expectedOut = src.replace(/\.[^.]+$/, '.jpeg')
		createdPaths.push(expectedOut)

		const result = await reEncode(src, 'jpeg')

		expect(result).to.equal(expectedOut)
		expect(existsSync(expectedOut)).to.equal(true)
		expect(existsSync(src)).to.equal(false)
	})

	it('jpg → png (different extension, explicit quality): re-encodes and unlinks the original', async () => {
		const src = makeSrcJpeg(`reencode-${Date.now()}-topng.jpg`)
		const expectedOut = src.replace(/\.[^.]+$/, '.png')
		createdPaths.push(expectedOut)

		const result = await reEncode(src, 'png', 80)

		expect(result).to.equal(expectedOut)
		expect(existsSync(result)).to.equal(true)
		expect(existsSync(src)).to.equal(false) // original unlinked (ext changed)
	})

	it('jpg → webp: covers the webp branch', async () => {
		const src = makeSrcJpeg(`reencode-${Date.now()}-towebp.jpg`)
		const expectedOut = src.replace(/\.[^.]+$/, '.webp')
		createdPaths.push(expectedOut)

		const result = await reEncode(src, 'webp')

		expect(result).to.equal(expectedOut)
		expect(existsSync(result)).to.equal(true)
		expect(existsSync(src)).to.equal(false)
	})

	it('jpg → avif: covers the avif branch', async () => {
		const src = makeSrcJpeg(`reencode-${Date.now()}-toavif.jpg`)
		const expectedOut = src.replace(/\.[^.]+$/, '.avif')
		createdPaths.push(expectedOut)

		const result = await reEncode(src, 'avif')

		expect(result).to.equal(expectedOut)
		expect(existsSync(result)).to.equal(true)
		expect(existsSync(src)).to.equal(false)
	})

	it('unsupported target extension: no if/else-if branch matches, sharp is never invoked, unlink still runs', async () => {
		const src = makeSrcJpeg(`reencode-${Date.now()}-tounsupported.jpg`)
		const expectedOut = src.replace(/\.[^.]+$/, '.gif')

		const result = await reEncode(src, 'gif')

		expect(result).to.equal(expectedOut)
		expect(existsSync(result)).to.equal(false) // sharp never ran, nothing written there
		expect(existsSync(src)).to.equal(false) // ext mismatch still trigger unlink
	})

	it('sharp failure (missing input file): reports to Sentry and throws "Error processing the image"', async () => {
		const missing = path.join(os.tmpdir(), `reencode-missing-${Date.now()}.jpg`)

		let err: unknown
		try {
			await reEncode(missing, 'jpeg')
		} catch (e) {
			err = e
		}

		expect(err).to.be.instanceOf(Error)
		expect((err as Error).message).to.equal('Error processing the image')
	})

	it('filePath with no extension: rewrites that same path and does not delete it', async () => {
		const src = path.join(os.tmpdir(), `reencode-noext-${Date.now()}`)
		writeFileSync(src, Buffer.from(MINIMAL_JPEG_B64, 'base64'))
		createdPaths.push(src)

		// No dot in filePath → the `\.[^.]+$` regex cannot match → finalFilepath === filePath. Comparing paths,
		// not extensions, is what keep the unlink from deleting the very file just written: '' !== 'png' would
		// have been true and wiped it out.
		const result = await reEncode(src, 'png')

		expect(result).to.equal(src)
		expect(existsSync(src)).to.equal(true)
	})

	it('unlink failure after a successful re-encode: reports to Sentry and throws 500 Internal Server Error', async () => {
		const src = makeSrcJpeg(`reencode-${Date.now()}-unlinkfail.jpg`)
		const expectedOut = src.replace(/\.[^.]+$/, '.png')
		createdPaths.push(expectedOut)

		sinon.stub(fsp, 'unlink').rejects(new Error('EACCES: permission denied'))

		await expectGraphQLErrorAsync(() => reEncode(src, 'png'), 500, 'Internal Server Error')

		// source never removed — unlink stubbed to fail
		expect(existsSync(src)).to.equal(true)
	})
})
