/**
 * Mutation-testing guards for private/files/reEncode.mts
 *
 * Real `sharp`, noise image. Pin encoder options through their observable output:
 * - jpeg/png `progressive: true` → `metadata().isProgressive`
 * - jpeg `quality` honoured → lower quality = smaller file than quality 100
 * - webp/avif `lossless: true` → decoded pixels identical to source
 * Path rewrite only touches the LAST extension. Failures reported to Sentry (real in-memory client).
 */
import { reEncode } from '@private/files/reEncode.mjs'
import { expect } from 'chai'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'fs'
import { promises as fsp } from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import sinon from 'sinon'

import { ISentryProbe, startSentryProbe } from '../../helpers/sentryProbeS2.mjs'

const SIZE = 48

async function writeNoiseSource(file: string) {
	await sharp({
		create: { width: SIZE, height: SIZE, channels: 3, background: { r: 128, g: 128, b: 128 }, noise: { type: 'gaussian', mean: 128, sigma: 60 } }
	})
		.png()
		.toFile(file)
}

const rawPixels = async (input: string | Buffer) => (await sharp(input).removeAlpha().raw().toBuffer()).toString('base64')

describe('reEncode — mutation guards', () => {
	let dir: string
	let probe: ISentryProbe

	beforeEach(async () => {
		// dots in the directory name too: only the LAST extension of the path may be rewritten
		dir = mkdtempSync(path.join(os.tmpdir(), 'reencode.mut.'))
		probe = await startSentryProbe()
	})

	afterEach(async () => {
		await probe.stop()
		sinon.restore()
		rmSync(dir, { recursive: true, force: true })
	})

	it('rewrites only the last extension of a dotted path', async () => {
		const src = path.join(dir, 'my.photo.png')
		await writeNoiseSource(src)

		const out = await reEncode(src, 'webp')

		expect(out).to.equal(path.join(dir, 'my.photo.webp'))
		expect(existsSync(out)).to.equal(true)
		expect(existsSync(src)).to.equal(false)
	})

	it('jpeg: progressive scan, quality honoured', async () => {
		const hi = path.join(dir, 'hi.png')
		const lo = path.join(dir, 'lo.png')
		await writeNoiseSource(hi)
		await writeNoiseSource(lo)

		const outHi = await reEncode(hi, 'jpeg', 100)
		const outLo = await reEncode(lo, 'jpeg', 20)

		expect((await sharp(outHi).metadata()).isProgressive).to.equal(true)
		expect(statSync(outLo).size).to.be.lessThan(statSync(outHi).size)
	})

	it('png: interlaced (progressive)', async () => {
		const src = path.join(dir, 'a.jpeg')
		await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: { r: 10, g: 200, b: 90 } } })
			.jpeg()
			.toFile(src)

		const out = await reEncode(src, 'png')

		expect((await sharp(out).metadata()).isProgressive).to.equal(true)
	})

	for (const ext of ['webp', 'avif'] as const) {
		it(`${ext}: lossless, decoded pixels identical to the source`, async () => {
			const src = path.join(dir, 'src.png')
			await writeNoiseSource(src)
			const before = await rawPixels(readFileSync(src))

			const out = await reEncode(src, ext)

			expect(await rawPixels(out)).to.equal(before)
		})
	}

	it('encode failure: reports the cause to Sentry, throws "Error processing the image"', async () => {
		const missing = path.join(dir, 'missing.jpg')

		let err: unknown
		try {
			await reEncode(missing, 'jpeg')
		} catch (e) {
			err = e
		}
		await probe.flush()

		expect((err as Error).message).to.equal('Error processing the image')
		expect(probe.texts()).to.have.lengthOf(1)
		expect(probe.texts()[0]).to.match(/^ENOENT/)
	})

	it('unlink failure: reports the cause to Sentry, throws 500', async () => {
		const src = path.join(dir, 'u.png')
		await writeNoiseSource(src)
		sinon.stub(fsp, 'unlink').rejects(new Error('EACCES: permission denied'))

		let err: unknown
		try {
			await reEncode(src, 'jpeg')
		} catch (e) {
			err = e
		}
		await probe.flush()

		expect((err as Error).message).to.equal('Internal Server Error')
		expect(probe.texts()).to.deep.equal(['EACCES: permission denied'])
	})
})
