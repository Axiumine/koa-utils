import { detectImageFormat, readImageSize } from '@private/glb/readImageHeader.mjs'
import { readJpeg } from '@private/glb/readJpegSize.mjs'
import { expect } from 'chai'
import sharp from 'sharp'

import { makeBombPng, makeImage, makeKtx2 } from '../../helpers/glbFixtures.mjs'

const sizeOf = (bytes: Uint8Array) => {
	const format = detectImageFormat(bytes)
	return format === null ? 'no format' : readImageSize(format, bytes)
}

// JPEG by hand: segments of marker + length + payload
const seg = (marker: number, payload: number[]): number[] => [
	0xff,
	marker,
	(payload.length + 2) >> 8,
	(payload.length + 2) & 0xff,
	...payload
]
const sof = (marker: number, width: number, height: number): number[] =>
	seg(marker, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0])
const jpeg = (...parts: number[][]): Uint8Array => new Uint8Array([0xff, 0xd8, ...parts.flat()])

const fourcc = (bytes: Uint8Array): string => new TextDecoder('latin1').decode(bytes.subarray(12, 16))

describe('private/glb/readImageHeader', () => {
	describe('detectImageFormat', () => {
		it('knows each format by its magic number, with its MIME type', async () => {
			expect(detectImageFormat(await makeImage('png'))?.name).to.equal('png')
			expect(detectImageFormat(await makeImage('png'))?.mime).to.equal('image/png')
			expect(detectImageFormat(await makeImage('jpeg'))?.name).to.equal('jpeg')
			expect(detectImageFormat(await makeImage('jpeg'))?.mime).to.equal('image/jpeg')
			expect(detectImageFormat(await makeImage('webp'))?.name).to.equal('webp')
			expect(detectImageFormat(await makeImage('webp'))?.mime).to.equal('image/webp')
			expect(detectImageFormat(makeKtx2(4, 4))?.name).to.equal('ktx2')
			expect(detectImageFormat(makeKtx2(4, 4))?.mime).to.equal('image/ktx2')
		})

		it('returns null for anything else', () => {
			expect(detectImageFormat(new Uint8Array())).to.equal(null)
			expect(detectImageFormat(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).to.equal(null)
			expect(detectImageFormat(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).to.equal(null)
		})

		it('a RIFF file that is not WebP is not WebP', () => {
			const wave = new Uint8Array(32)
			wave.set([0x52, 0x49, 0x46, 0x46], 0)
			wave.set([0x57, 0x41, 0x56, 0x45], 8)
			expect(detectImageFormat(wave)).to.equal(null)
		})

		it('needs the whole prefix: a short PNG signature is not PNG', () => {
			expect(detectImageFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).to.equal(null)
			expect(detectImageFormat(new Uint8Array([0xff, 0xd8]))).to.equal(null)
		})
	})

	describe('PNG', () => {
		it('reads width and height of a real file', async () => {
			expect(sizeOf(await makeImage('png', 7, 5))).to.deep.equal({ width: 7, height: 5 })
		})

		it('reads a header that claims a huge size without any pixel data', () => {
			expect(sizeOf(makeBombPng(100_000, 90_000))).to.deep.equal({ width: 100_000, height: 90_000 })
		})

		it('rejects a first chunk that is not IHDR (the CgBI variant)', () => {
			const png = makeBombPng(4, 4)
			png.set([0x43, 0x67, 0x42, 0x49], 12)
			expect(sizeOf(png)).to.equal(null)
		})

		it('rejects an IHDR whose length is not 13', () => {
			const png = makeBombPng(4, 4)
			png[11] = 14
			expect(sizeOf(png)).to.equal(null)
		})

		it('rejects a side of 0, and a side of 2^31 or more', () => {
			expect(sizeOf(makeBombPng(0, 4))).to.equal(null)
			expect(sizeOf(makeBombPng(4, 0))).to.equal(null)
			expect(sizeOf(makeBombPng(0x7fffffff, 1))).to.deep.equal({ width: 0x7fffffff, height: 1 })
			expect(sizeOf(makeBombPng(1, 0x7fffffff))).to.deep.equal({ width: 1, height: 0x7fffffff })
			expect(sizeOf(makeBombPng(0x80000000, 1))).to.equal(null)
			expect(sizeOf(makeBombPng(1, 0x80000000))).to.equal(null)
		})

		it('returns null for a header that is cut short', () => {
			expect(sizeOf(makeBombPng(4, 4).subarray(0, 20))).to.equal(null)
			expect(sizeOf(makeBombPng(4, 4).subarray(0, 8))).to.equal(null)
		})
	})

	describe('JPEG', () => {
		it('reads real baseline and progressive files', async () => {
			expect(sizeOf(await makeImage('jpeg', 9, 3))).to.deep.equal({ width: 9, height: 3 })
			const progressive = await sharp(Buffer.alloc(11 * 6 * 3, 90), { raw: { width: 11, height: 6, channels: 3 } })
				.jpeg({ progressive: true })
				.toBuffer()
			expect(sizeOf(new Uint8Array(progressive))).to.deep.equal({ width: 11, height: 6 })
		})

		it('reads a file with EXIF before the frame header', async () => {
			expect(sizeOf(await makeImage('jpeg', 12, 8, true))).to.deep.equal({ width: 12, height: 8 })
		})

		it('reads width and height from the right bytes', () => {
			expect(sizeOf(jpeg(sof(0xc0, 300, 200)))).to.deep.equal({ width: 300, height: 200 })
			expect(sizeOf(jpeg(sof(0xc0, 65535, 1)))).to.deep.equal({ width: 65535, height: 1 })
		})

		it('treats every start-of-frame marker as a frame header, and the lookalikes as segments', () => {
			for (const marker of [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]) {
				expect(sizeOf(jpeg(sof(marker, 5, 6))), marker.toString(16)).to.deep.equal({ width: 5, height: 6 })
			}
			for (const marker of [0xc4, 0xc8, 0xcc, 0xbf, 0xdb, 0xe0]) {
				expect(sizeOf(jpeg(seg(marker, [1, 2, 3]), sof(0xc0, 5, 6))), marker.toString(16)).to.deep.equal({ width: 5, height: 6 })
			}
		})

		it('skips segments, fill bytes and markers that carry no length', () => {
			expect(sizeOf(jpeg(seg(0xe0, [1, 2, 3, 4]), seg(0xe1, new Array<number>(40).fill(7)), sof(0xc0, 5, 6)))).to.deep.equal({
				width: 5,
				height: 6
			})
			expect(sizeOf(jpeg([0xff], sof(0xc0, 5, 6)))).to.deep.equal({ width: 5, height: 6 })
			for (const marker of [0x01, 0xd0, 0xd3, 0xd7, 0xd8]) {
				expect(sizeOf(jpeg([0xff, marker], sof(0xc0, 5, 6))), marker.toString(16)).to.deep.equal({ width: 5, height: 6 })
			}
		})

		it('rejects end-of-image before any frame header', () => {
			expect(sizeOf(jpeg([0xff, 0xd9], sof(0xc0, 5, 6)))).to.equal(null)
		})

		it('rejects a byte that is not a marker', () => {
			expect(sizeOf(jpeg([0xff, 0xe0, 0x00, 0x04, 0, 0, 0x12, 0x34]))).to.equal(null)
		})

		it('a byte that is not a marker ends the walk, even when a frame header lies right behind it', () => {
			const frame = [0x12, 0xc0, 0x00, 0x0b, 8, 0, 6, 0, 5, 1, 1, 0x11, 0]
			expect(sizeOf(jpeg([0xff, 0xe0, 0x00, 0x02], frame))).to.equal(null)
		})

		it('end-of-image ends the walk, even when a frame header lies right behind it', () => {
			expect(sizeOf(jpeg([0xff, 0xd9, 0x00, 0x02], sof(0xc0, 5, 6)))).to.equal(null)
		})

		it('readJpeg itself returns null on a file with nothing after the start marker, it does not read past the end', () => {
			expect(readJpeg(new DataView(Uint8Array.of(0xff, 0xd8).buffer))).to.equal(null)
		})

		it('a segment length below 2 ends the walk', () => {
			expect(sizeOf(jpeg([0xff, 0xe0, 0x00, 0x01], sof(0xc0, 5, 6)))).to.equal(null)
			expect(sizeOf(jpeg([0xff, 0xe0, 0x00, 0x00], sof(0xc0, 5, 6)))).to.equal(null)
		})

		it('accepts a segment whose length is exactly 2', () => {
			expect(sizeOf(jpeg([0xff, 0xe0, 0x00, 0x02], sof(0xc0, 5, 6)))).to.deep.equal({ width: 5, height: 6 })
		})

		it('rejects a side of 0', () => {
			expect(sizeOf(jpeg(sof(0xc0, 0, 6)))).to.equal(null)
			expect(sizeOf(jpeg(sof(0xc0, 5, 0)))).to.equal(null)
		})

		it('returns null when the file ends before a frame header, or inside one', () => {
			expect(sizeOf(jpeg(seg(0xe0, [1, 2])))).to.equal(null)
			expect(sizeOf(jpeg(sof(0xc0, 5, 6)).subarray(0, 10))).to.equal(null)
			expect(sizeOf(new Uint8Array([0xff, 0xd8, 0xff]))).to.equal(null)
			expect(sizeOf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff]))).to.equal(null)
		})
	})

	describe('WebP', () => {
		it('reads a lossy file (VP8)', async () => {
			const webp = await makeImage('webp', 13, 7)
			expect(fourcc(webp)).to.equal('VP8 ')
			expect(sizeOf(webp)).to.deep.equal({ width: 13, height: 7 })
		})

		it('reads a lossless file (VP8L)', async () => {
			const webp = new Uint8Array(
				await sharp(Buffer.alloc(21 * 10 * 3, 50), { raw: { width: 21, height: 10, channels: 3 } })
					.webp({ lossless: true })
					.toBuffer()
			)
			expect(fourcc(webp)).to.equal('VP8L')
			expect(sizeOf(webp)).to.deep.equal({ width: 21, height: 10 })
		})

		it('reads an extended file (VP8X)', async () => {
			const webp = new Uint8Array(
				await sharp(Buffer.alloc(300 * 17 * 4, 50), { raw: { width: 300, height: 17, channels: 4 } })
					.webp()
					.toBuffer()
			)
			expect(fourcc(webp)).to.equal('VP8X')
			expect(sizeOf(webp)).to.deep.equal({ width: 300, height: 17 })
		})

		it('reads sizes above 8 bits in the lossless header', async () => {
			const lossless = new Uint8Array(
				await sharp(Buffer.alloc(1000 * 700 * 3, 50), { raw: { width: 1000, height: 700, channels: 3 } })
					.webp({ lossless: true })
					.toBuffer()
			)
			expect(sizeOf(lossless)).to.deep.equal({ width: 1000, height: 700 })
		})

		it('reads the 24 bit sizes of a hand-made VP8X header', async () => {
			const webp = new Uint8Array(
				await sharp(Buffer.alloc(300 * 17 * 4, 50), { raw: { width: 300, height: 17, channels: 4 } })
					.webp()
					.toBuffer()
			)
			// width - 1 = 0x012345 at 24..26, height - 1 = 0x0a0b0c at 27..29
			webp.set([0x45, 0x23, 0x01, 0x0c, 0x0b, 0x0a], 24)
			expect(sizeOf(webp)).to.deep.equal({ width: 0x012346, height: 0x0a0b0d })
		})

		it('keeps 14 bits of a lossy size and ignores the scale bits above them', async () => {
			const webp = await makeImage('webp', 13, 7)
			const view = new DataView(webp.buffer, webp.byteOffset)
			view.setUint16(26, 13 | 0xc000, true)
			view.setUint16(28, 7 | 0x4000, true)
			expect(sizeOf(webp)).to.deep.equal({ width: 13, height: 7 })
		})

		it('rejects a lossy file without the start code', async () => {
			const webp = await makeImage('webp', 13, 7)
			webp[23] = 0
			expect(sizeOf(webp)).to.equal(null)
		})

		it('rejects a lossless file without the signature byte', async () => {
			const webp = new Uint8Array(
				await sharp(Buffer.alloc(21 * 10 * 3, 50), { raw: { width: 21, height: 10, channels: 3 } })
					.webp({ lossless: true })
					.toBuffer()
			)
			webp[20] = 0
			expect(sizeOf(webp)).to.equal(null)
		})

		it('rejects an unknown first chunk, and a header that is cut short', async () => {
			const webp = await makeImage('webp', 13, 7)
			const unknown = new Uint8Array(webp)
			unknown.set([0x58, 0x58, 0x58, 0x58], 12)
			expect(sizeOf(unknown)).to.equal(null)
			expect(sizeOf(webp.subarray(0, 20))).to.equal(null)
			expect(sizeOf(webp.subarray(0, 14))).to.equal(null)
		})
	})

	describe('KTX2', () => {
		it('reads width and height', () => {
			expect(sizeOf(makeKtx2(64, 32))).to.deep.equal({ width: 64, height: 32 })
			expect(sizeOf(makeKtx2(64, 32, 6))).to.deep.equal({ width: 64, height: 32 })
		})

		it('accepts 1 to 32 levels and nothing outside', () => {
			expect(sizeOf(makeKtx2(8, 8, 1))).to.deep.equal({ width: 8, height: 8 })
			expect(sizeOf(makeKtx2(8, 8, 32))).to.deep.equal({ width: 8, height: 8 })
			const none = makeKtx2(8, 8)
			new DataView(none.buffer).setUint32(40, 0, true)
			expect(sizeOf(none)).to.equal(null)
			const many = makeKtx2(8, 8, 32)
			new DataView(many.buffer).setUint32(40, 33, true)
			expect(sizeOf(many)).to.equal(null)
		})

		it('a level must end inside the file: the last byte passes, one more does not', () => {
			const ktx = makeKtx2(8, 8)
			const view = new DataView(ktx.buffer)
			const offset = view.getUint32(80, true)
			view.setUint32(88, ktx.length - offset, true)
			expect(sizeOf(ktx)).to.deep.equal({ width: 8, height: 8 })
			view.setUint32(88, ktx.length - offset + 1, true)
			expect(sizeOf(ktx)).to.equal(null)
		})

		it('rejects an offset or a length that needs more than 32 bits, in a file with room to spare', () => {
			const room = (ktx: Uint8Array): Uint8Array => {
				const padded = new Uint8Array(ktx.length + 1000)
				padded.set(ktx)
				return padded
			}
			const offsetBomb = room(makeKtx2(8, 8))
			new DataView(offsetBomb.buffer).setUint32(84, 1, true)
			expect(sizeOf(offsetBomb)).to.equal(null)
			const lengthBomb = room(makeKtx2(8, 8))
			new DataView(lengthBomb.buffer).setUint32(92, 1, true)
			expect(sizeOf(lengthBomb)).to.equal(null)
			expect(sizeOf(room(makeKtx2(8, 8)))).to.deep.equal({ width: 8, height: 8 })
		})

		it('reads exactly the declared levels: the entry after the last one is not looked at', () => {
			const ktx = makeKtx2(8, 8, 1)
			// the bytes after the level index hold the level data, so a read of one entry too many sees this length
			new DataView(ktx.buffer).setUint32(80 + 24 + 8, 100_000, true)
			expect(sizeOf(ktx)).to.deep.equal({ width: 8, height: 8 })
		})

		it('checks every level, not only the first', () => {
			const ktx = makeKtx2(8, 8, 3)
			new DataView(ktx.buffer).setUint32(80 + 2 * 24 + 8, 100_000, true)
			expect(sizeOf(ktx)).to.equal(null)
		})

		it('rejects a side of 0', () => {
			expect(sizeOf(makeKtx2(0, 8))).to.equal(null)
			expect(sizeOf(makeKtx2(8, 0))).to.equal(null)
		})

		it('returns null when the level index runs past the file', () => {
			expect(sizeOf(makeKtx2(8, 8, 4).subarray(0, 90))).to.equal(null)
			expect(sizeOf(makeKtx2(8, 8).subarray(0, 30))).to.equal(null)
		})
	})
})
