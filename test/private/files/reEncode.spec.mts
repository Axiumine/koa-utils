/**
 * Tests for private/files/reEncode.mts
 *
 * Chain: reEncode → sharp(filePath).{jpeg,png,webp,avif}(...).withMetadata({}).withExif({}).toFile(finalFilepath)
 *        on sharp failure: Sentry.captureException(err) → throw new Error('Error processing the image')
 *        when the original extension differs from the target one: fs.promises.unlink(filePath)
 *        on unlink failure: Sentry.captureException(e) → throw throwInternalError() (GraphQLError 500)
 *
 * `sharp` and `@sentry/node` are real ES module namespaces (sealed, non-configurable exports) —
 * sinon refuses to stub them ("ES Modules cannot be stubbed"), the same limitation already
 * documented in test/koa/router/verifyEmail.spec.mts. So this spec drives the real `sharp`
 * library against a tiny, valid, hand-written 1x1 JPEG fixture (same fixture used by
 * test/files/uploadTempImage.spec.mts) to exercise every re-encode branch for real, and lets
 * the real (uninitialized) Sentry.captureException run as a safe no-op. Only `fs.promises.unlink`
 * is stubbed — it is a plain mutable object property (not a sealed namespace), so sinon can
 * control the unlink-failure branch deterministically.
 */
import { reEncode } from '@private/files/reEncode.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { promises as fsp, writeFileSync, existsSync, unlinkSync } from 'fs'
import os from 'os'
import path from 'path'

import { expectGraphQLErrorAsync } from '../../helpers/assertGraphQLError.mjs'

// Minimal valid 1x1 JPEG (base64 encoded) — real bytes so sharp can decode & re-encode it
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

	// KNOWN BUG — see the file header. When the source extension already equals the target,
	// finalFilepath === filePath and sharp rejects with "Cannot use same file for input and
	// output". This asserts the behaviour that ships today; fixing the source must change this
	// expectation deliberately, not silently.
	it('jpeg → jpeg (same extension): throws, because input and output resolve to one path', async () => {
		const src = makeSrcJpeg(`reencode-${Date.now()}-same.jpeg`)

		let err: unknown
		try {
			await reEncode(src, 'jpeg')
		} catch (e) {
			err = e
		}

		expect(err).to.be.instanceOf(Error)
		expect((err as Error).message).to.equal('Error processing the image')
		expect(existsSync(src)).to.equal(true) // untouched — nothing was re-encoded
	})

	it('.JPEG → jpeg (case-insensitive match): re-encodes, skips the unlink, keeps the original', async () => {
		// originalFileExt is lowercased to 'jpeg' and equals ext, so the unlink block is skipped —
		// yet finalFilepath ('.jpeg') differs from the source ('.JPEG'), so sharp still succeeds.
		// This is the only way to reach the `originalFileExt !== ext` false arm, since an exact
		// extension match always throws (above). Also exercises the default quality = 100.
		const src = makeSrcJpeg(`reencode-${Date.now()}-upper.JPEG`)
		const expectedOut = src.replace(/\.[^.]+$/, '.jpeg')
		createdPaths.push(expectedOut)

		const result = await reEncode(src, 'jpeg')

		expect(result).to.equal(expectedOut)
		expect(existsSync(expectedOut)).to.equal(true)
		expect(existsSync(src)).to.equal(true) // unlink was skipped, original left behind
	})

	it('jpg → png (different extension, explicit quality): re-encodes and unlinks the original', async () => {
		const src = makeSrcJpeg(`reencode-${Date.now()}-topng.jpg`)
		const expectedOut = src.replace(/\.[^.]+$/, '.png')
		createdPaths.push(expectedOut)

		const result = await reEncode(src, 'png', 80)

		expect(result).to.equal(expectedOut)
		expect(existsSync(result)).to.equal(true)
		expect(existsSync(src)).to.equal(false) // original was unlinked (extension changed)
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
		expect(existsSync(result)).to.equal(false) // sharp never ran, nothing was written there
		expect(existsSync(src)).to.equal(false) // extension mismatch still triggers unlink
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

	it('filePath with no extension: originalFileExt falls back to empty string, sharp rejects (same in/out path)', async () => {
		const src = path.join(os.tmpdir(), `reencode-noext-${Date.now()}`)
		writeFileSync(src, Buffer.from(MINIMAL_JPEG_B64, 'base64'))
		createdPaths.push(src)

		// No dot in filePath → the `\.[^.]+$` regex cannot match, so finalFilepath === filePath.
		// Sharp then rejects because input and output would be the very same file, landing in
		// the outer catch block — while still exercising the `parts.length > 1 ? ... : ''` branch.
		let err: unknown
		try {
			await reEncode(src, 'png')
		} catch (e) {
			err = e
		}

		expect(err).to.be.instanceOf(Error)
		expect((err as Error).message).to.equal('Error processing the image')
	})

	it('unlink failure after a successful re-encode: reports to Sentry and throws 500 Internal Server Error', async () => {
		const src = makeSrcJpeg(`reencode-${Date.now()}-unlinkfail.jpg`)
		const expectedOut = src.replace(/\.[^.]+$/, '.png')
		createdPaths.push(expectedOut)

		sinon.stub(fsp, 'unlink').rejects(new Error('EACCES: permission denied'))

		await expectGraphQLErrorAsync(() => reEncode(src, 'png'), 500, 'Internal Server Error')

		// the source was never actually removed since unlink was stubbed to fail
		expect(existsSync(src)).to.equal(true)
	})
})
