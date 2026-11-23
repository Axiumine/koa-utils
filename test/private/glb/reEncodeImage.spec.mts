import { reEncodeImage } from '@private/glb/reEncodeImage.mjs'
import { detectImageFormat, type IReencodableFormat } from '@private/glb/readImageHeader.mjs'
import { expect } from 'chai'
import sharp from 'sharp'

import { makeImage } from '../../helpers/glbFixtures.mjs'

const formats = {
	png: detectImageFormat(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
	jpeg: detectImageFormat(Uint8Array.of(0xff, 0xd8, 0xff)),
	webp: detectImageFormat(Uint8Array.of(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))
}

// the format object the sanitiser hands over, by name
const format = (name: 'png' | 'jpeg' | 'webp'): IReencodableFormat => {
	const found = formats[name]
	if (found === null || found.name === 'ktx2') throw new Error('no such format')
	return found
}

describe('private/glb/reEncodeImage', () => {
	for (const name of ['png', 'jpeg', 'webp'] as const) {
		it(`${name}: decodes and encodes again in the same format, same size`, async () => {
			const out = await reEncodeImage(await makeImage(name, 24, 10), format(name), 90, 2048)
			expect(out).to.be.instanceOf(Uint8Array)
			const meta = await sharp(out).metadata()
			expect(meta.format).to.equal(name)
			expect([meta.width, meta.height]).to.deep.equal([24, 10])
		})
	}

	it('jpeg: progressive, and the quality argument is used', async () => {
		const source = await makeImage('jpeg', 64, 64)
		const low = await reEncodeImage(source, format('jpeg'), 5, 2048)
		const high = await reEncodeImage(source, format('jpeg'), 95, 2048)
		expect(high.length).to.be.greaterThan(low.length)
		expect((await sharp(low).metadata()).isProgressive).to.equal(true)
	})

	it('webp: the quality argument is used', async () => {
		const source = await makeImage('webp', 64, 64)
		const low = await reEncodeImage(source, format('webp'), 5, 2048)
		const high = await reEncodeImage(source, format('webp'), 95, 2048)
		expect(high.length).to.be.greaterThan(low.length)
	})

	it('drops EXIF, so a copyright or a GPS position does not travel', async () => {
		const withExif = await makeImage('jpeg', 16, 16, true)
		expect((await sharp(withExif).metadata()).exif).to.not.equal(undefined)
		const out = await reEncodeImage(withExif, format('jpeg'), 90, 2048)
		expect((await sharp(out).metadata()).exif).to.equal(undefined)
		expect(Buffer.from(out).includes('secret-exif')).to.equal(false)
	})

	it('drops XMP and an ICC profile too', async () => {
		const tagged = await sharp(Buffer.alloc(8 * 8 * 3, 120), { raw: { width: 8, height: 8, channels: 3 } })
			.withIccProfile('p3')
			.withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><secret-xmp/></x:xmpmeta>')
			.png()
			.toBuffer()
		expect((await sharp(tagged).metadata()).icc).to.not.equal(undefined)
		const out = await reEncodeImage(new Uint8Array(tagged), format('png'), 90, 2048)
		const meta = await sharp(out).metadata()
		expect(meta.icc).to.equal(undefined)
		expect(meta.xmp).to.equal(undefined)
		expect(Buffer.from(out).includes('secret-xmp')).to.equal(false)
	})

	it('removes bytes hidden after the image data', async () => {
		const png = await makeImage('png', 16, 16)
		const polyglot = new Uint8Array([...png, ...new TextEncoder().encode('<script>evil()</script>')])
		const out = await reEncodeImage(polyglot, format('png'), 90, 2048)
		expect(Buffer.from(out).includes('<script>')).to.equal(false)
	})

	it('refuses an image with more pixels than maxSide squared, before it allocates them', async () => {
		let error: unknown
		try {
			await reEncodeImage(await makeImage('png', 40, 40), format('png'), 90, 30)
		} catch (e) {
			error = e
		}
		expect(error).to.be.instanceOf(Error)
		expect((error as Error).message).to.match(/pixel limit/)
	})

	it('accepts an image of exactly maxSide squared pixels', async () => {
		const out = await reEncodeImage(await makeImage('png', 30, 30), format('png'), 90, 30)
		expect((await sharp(out).metadata()).width).to.equal(30)
	})

	it('rejects bytes that do not decode', async () => {
		let error: unknown
		try {
			await reEncodeImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), format('png'), 90, 2048)
		} catch (e) {
			error = e
		}
		expect(error).to.be.instanceOf(Error)
	})

	it('rejects a truncated file instead of repairing it (failOn warning)', async () => {
		const jpeg = await makeImage('jpeg', 64, 64)
		let error: unknown
		try {
			await reEncodeImage(jpeg.subarray(0, Math.floor(jpeg.length * 0.6)), format('jpeg'), 90, 2048)
		} catch (e) {
			error = e
		}
		expect(error).to.be.instanceOf(Error)
	})
})
