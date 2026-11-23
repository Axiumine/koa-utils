import { checkGlbImages } from '@private/glb/checkGlbImages.mjs'
import { emptyStats } from '@private/glb/glbStats.mjs'
import { expect } from 'chai'

import { GLB_POLICY_DEFAULTS, type IGlbPolicy } from '../../../dist/files/GLB_POLICY_DEFAULTS.mjs'
import { makeBombPng, makeImage, makeKtx2 } from '../../helpers/glbFixtures.mjs'

const policy = (over: Partial<IGlbPolicy> = {}): IGlbPolicy => ({ ...GLB_POLICY_DEFAULTS, ...over })

// BIN chunk = images back to back. Views + image objects built to match
function pack(images: { bytes: Uint8Array; mimeType?: string }[]) {
	const total = images.reduce((sum, image) => sum + image.bytes.length, 0)
	const bin = new Uint8Array(total + 64)
	const bufferViews: object[] = []
	let at = 0
	for (const image of images) {
		bin.set(image.bytes, at)
		bufferViews.push({ buffer: 0, byteOffset: at, byteLength: image.bytes.length })
		at += image.bytes.length
	}
	const list = images.map((image, index) => ({ bufferView: index, ...(image.mimeType ? { mimeType: image.mimeType } : {}) }))
	return { bin, json: { bufferViews, images: list } as Record<string, unknown> }
}

const run = (json: Record<string, unknown>, bin: Uint8Array | null, over: Partial<IGlbPolicy> = {}) => {
	const stats = emptyStats(0)
	return { reasons: checkGlbImages(json, bin, policy(over), stats), stats }
}

describe('private/glb/checkGlbImages', () => {
	it('accepts real PNG, JPEG, WebP and KTX2 images and records the longest side', async () => {
		const { bin, json } = pack([
			{ bytes: await makeImage('png', 20, 10), mimeType: 'image/png' },
			{ bytes: await makeImage('jpeg', 30, 40), mimeType: 'image/jpeg' },
			{ bytes: await makeImage('webp', 8, 9), mimeType: 'image/webp' },
			{ bytes: makeKtx2(16, 16), mimeType: 'image/ktx2' }
		])
		const { reasons, stats } = run(json, bin)
		expect(reasons).to.deep.equal([])
		expect(stats.maxTextureSide).to.equal(40)
	})

	it('a missing mimeType is left to the validator', async () => {
		const { bin, json } = pack([{ bytes: await makeImage('png') }])
		expect(run(json, bin).reasons).to.deep.equal([])
	})

	it('no images, no reasons', () => {
		expect(run({}, null).reasons).to.deep.equal([])
		expect(run({ images: [] }, null).stats.maxTextureSide).to.equal(0)
	})

	it('a side equal to maxTextureSide passes, one more is LIMIT_EXCEEDED naming the image', async () => {
		const { bin, json } = pack([{ bytes: await makeImage('png', 8, 4) }, { bytes: await makeImage('png', 9, 3) }])
		expect(run(json, bin, { maxTextureSide: 9 }).reasons).to.deep.equal([])
		expect(run(json, bin, { maxTextureSide: 8 }).reasons).to.deep.equal([
			{ code: 'LIMIT_EXCEEDED', limit: 'maxTextureSide', message: 'images[1]: 9 is over the limit maxTextureSide = 8' }
		])
	})

	it('checks the height as well as the width', async () => {
		const { bin, json } = pack([{ bytes: await makeImage('png', 3, 9) }])
		expect(run(json, bin, { maxTextureSide: 8 }).reasons.map((reason) => reason.limit)).to.deep.equal(['maxTextureSide'])
	})

	it('the texture bomb: a header of 100 000 x 100 000 is rejected from its 33 bytes', () => {
		const { bin, json } = pack([{ bytes: makeBombPng(100_000, 100_000), mimeType: 'image/png' }])
		const { reasons, stats } = run(json, bin)
		expect(reasons.map((reason) => reason.limit)).to.deep.equal(['maxTextureSide', 'maxTexturePixels'])
		expect(stats.maxTextureSide).to.equal(100_000)
	})

	it('the pixels of all images add up: equal to the limit passes, one more does not', async () => {
		const { bin, json } = pack([{ bytes: await makeImage('png', 4, 4) }, { bytes: await makeImage('png', 5, 4) }])
		expect(run(json, bin, { maxTexturePixels: 36 }).reasons).to.deep.equal([])
		expect(run(json, bin, { maxTexturePixels: 35 }).reasons).to.deep.equal([
			{
				code: 'LIMIT_EXCEEDED',
				limit: 'maxTexturePixels',
				message: 'the images together: 36 is over the limit maxTexturePixels = 35'
			}
		])
	})

	it('the longest side is the maximum over the images, not the last one', async () => {
		const { bin, json } = pack([{ bytes: await makeImage('png', 30, 2) }, { bytes: await makeImage('png', 5, 5) }])
		expect(run(json, bin).stats.maxTextureSide).to.equal(30)
	})

	it('IMAGE_UNREADABLE: no BIN chunk, no bufferView, or a view outside the chunk', async () => {
		const png = await makeImage('png')
		const { bin, json } = pack([{ bytes: png }])
		const message = 'images[0] has no bytes inside the BIN chunk'
		const expected = [{ code: 'IMAGE_UNREADABLE', pointer: '/images/0', message }]
		expect(run(json, null).reasons).to.deep.equal(expected)
		expect(run({ ...json, images: [{ mimeType: 'image/png' }] }, bin).reasons).to.deep.equal(expected)
		expect(run({ ...json, images: [{ bufferView: 'x' }] }, bin).reasons).to.deep.equal(expected)
		expect(run({ ...json, images: [{ bufferView: 9 }] }, bin).reasons).to.deep.equal(expected)
		expect(run({ ...json, images: [5] }, bin).reasons).to.deep.equal(expected)
		const outside = { ...json, bufferViews: [{ buffer: 0, byteOffset: bin.length - 2, byteLength: png.length }] }
		expect(run(outside, bin).reasons).to.deep.equal(expected)
	})

	it('a buffer view may end exactly at the end of the chunk, and may not be empty or in another buffer', async () => {
		const png = await makeImage('png')
		const exact = { images: [{ bufferView: 0 }], bufferViews: [{ buffer: 0, byteOffset: 10, byteLength: png.length }] }
		const bin = new Uint8Array(10 + png.length)
		bin.set(png, 10)
		expect(run(exact, bin).reasons).to.deep.equal([])
		const oneMore = { images: [{ bufferView: 0 }], bufferViews: [{ buffer: 0, byteOffset: 11, byteLength: png.length }] }
		expect(run(oneMore, bin).reasons.map((reason) => reason.code)).to.deep.equal(['IMAGE_UNREADABLE'])
		const empty = { images: [{ bufferView: 0 }], bufferViews: [{ buffer: 0, byteOffset: 10, byteLength: 0 }] }
		expect(run(empty, bin).reasons.map((reason) => reason.code)).to.deep.equal(['IMAGE_UNREADABLE'])
		const other = { images: [{ bufferView: 0 }], bufferViews: [{ buffer: 1, byteOffset: 10, byteLength: png.length }] }
		expect(run(other, bin).reasons.map((reason) => reason.code)).to.deep.equal(['IMAGE_UNREADABLE'])
	})

	it('a view without byteOffset starts at 0', async () => {
		const png = await makeImage('png')
		const json = { images: [{ bufferView: 0 }], bufferViews: [{ buffer: 0, byteLength: png.length }] }
		expect(run(json, png).reasons).to.deep.equal([])
	})

	it('IMAGE_UNSUPPORTED: bytes that are not an image format glTF allows', () => {
		const { bin, json } = pack([
			{ bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), mimeType: 'image/png' }
		])
		expect(run(json, bin).reasons).to.deep.equal([
			{ code: 'IMAGE_UNSUPPORTED', pointer: '/images/0', message: 'images[0] is not PNG, JPEG, WebP or KTX2' }
		])
	})

	it('IMAGE_FORMAT_MISMATCH: the claimed mimeType differs from the bytes', async () => {
		const { bin, json } = pack([{ bytes: await makeImage('png'), mimeType: 'image/jpeg' }])
		expect(run(json, bin).reasons).to.deep.equal([
			{ code: 'IMAGE_FORMAT_MISMATCH', pointer: '/images/0', message: 'images[0] says image/jpeg but the bytes are image/png' }
		])
	})

	it('a mimeType that is not a string is ignored', async () => {
		const { bin, json } = pack([{ bytes: await makeImage('png') }])
		expect(run({ ...json, images: [{ bufferView: 0, mimeType: 5 }] }, bin).reasons).to.deep.equal([])
	})

	it('IMAGE_UNREADABLE: a recognised format whose header cannot be read', () => {
		const { bin, json } = pack([{ bytes: makeBombPng(4, 4).subarray(0, 18), mimeType: 'image/png' }])
		expect(run(json, bin).reasons).to.deep.equal([
			{ code: 'IMAGE_UNREADABLE', pointer: '/images/0', message: 'images[0] has a header that cannot be read' }
		])
	})

	it('an image that carries a uri is left to the URI check', () => {
		expect(run({ images: [{ uri: 'https://evil.example/x.png' }] }, null).reasons).to.deep.equal([])
		expect(run({ images: [{ uri: 'x.png', bufferView: 0 }] }, null).reasons).to.deep.equal([])
	})

	it('reports every bad image, with its own index', async () => {
		const { bin, json } = pack([
			{ bytes: await makeImage('png'), mimeType: 'image/png' },
			{ bytes: makeBombPng(5000, 5000), mimeType: 'image/png' },
			{ bytes: new Uint8Array([1, 2, 3, 4]), mimeType: 'image/png' }
		])
		const { reasons } = run(json, bin, { maxTexturePixels: 1_000_000_000 })
		expect(reasons.map((reason) => `${reason.code} ${reason.pointer ?? ''}`)).to.deep.equal([
			'LIMIT_EXCEEDED ',
			'IMAGE_UNSUPPORTED /images/2'
		])
	})

	it('survives bufferViews and images that are not arrays', () => {
		expect(run({ images: 'x', bufferViews: 5 }, null).reasons).to.deep.equal([])
		expect(
			run({ images: [{ bufferView: 0 }], bufferViews: 'x' }, new Uint8Array(4)).reasons.map((reason) => reason.code)
		).to.deep.equal(['IMAGE_UNREADABLE'])
	})
})
