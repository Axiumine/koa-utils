import { Document } from '@gltf-transform/core'
import { emptyStats } from '@private/glb/glbStats.mjs'
import { reencodeTextures } from '@private/glb/reencodeTextures.mjs'
import { expect } from 'chai'
import sharp from 'sharp'

import { GLB_POLICY_DEFAULTS, type IGlbPolicy } from '../../../dist/files/GLB_POLICY_DEFAULTS.mjs'
import { buildDocument, makeImage, makeKtx2 } from '../../helpers/glbFixtures.mjs'

const policy = (over: Partial<IGlbPolicy> = {}): IGlbPolicy => ({ ...GLB_POLICY_DEFAULTS, ...over })

describe('private/glb/reencodeTextures', () => {
	it('re-encodes PNG, JPEG and WebP textures, counts them, keeps the size and the MIME type', async () => {
		const doc = await buildDocument({
			textures: [
				{ format: 'png', width: 20, height: 10 },
				{ format: 'jpeg', width: 30, height: 12 },
				{ format: 'webp', width: 8, height: 9 }
			]
		})
		const stats = emptyStats(0)
		expect(await reencodeTextures(doc, policy(), stats)).to.deep.equal([])
		expect(stats.texturesReencoded).to.equal(3)
		const textures = doc.getRoot().listTextures()
		for (const [index, expected] of [
			[20, 10],
			[30, 12],
			[8, 9]
		].entries()) {
			const meta = await sharp(textures[index]?.getImage() ?? new Uint8Array()).metadata()
			expect([meta.width, meta.height], String(index)).to.deep.equal(expected)
		}
		expect(textures.map((texture) => texture.getMimeType())).to.deep.equal(['image/png', 'image/jpeg', 'image/webp'])
	})

	it('puts new bytes in the document: a polyglot payload after the image is gone', async () => {
		const doc = new Document()
		const png = await makeImage('png', 16, 16)
		doc
			.createTexture('t')
			.setMimeType('image/png')
			.setImage(new Uint8Array([...png, ...new TextEncoder().encode('EVIL-PAYLOAD')]))
		await reencodeTextures(doc, policy(), emptyStats(0))
		expect(Buffer.from(doc.getRoot().listTextures()[0]?.getImage() ?? new Uint8Array()).includes('EVIL-PAYLOAD')).to.equal(false)
	})

	it('uses textureQuality and maxTextureSide of the policy', async () => {
		const jpeg = await makeImage('jpeg', 64, 64)
		const lowDoc = new Document()
		lowDoc.createTexture('t').setMimeType('image/jpeg').setImage(jpeg)
		const highDoc = new Document()
		highDoc.createTexture('t').setMimeType('image/jpeg').setImage(jpeg)
		await reencodeTextures(lowDoc, policy({ textureQuality: 5 }), emptyStats(0))
		await reencodeTextures(highDoc, policy({ textureQuality: 95 }), emptyStats(0))
		expect(highDoc.getRoot().listTextures()[0]?.getImage()?.length).to.be.greaterThan(
			lowDoc.getRoot().listTextures()[0]?.getImage()?.length ?? 0
		)
		const small = new Document()
		small
			.createTexture('t')
			.setMimeType('image/png')
			.setImage(await makeImage('png', 40, 40))
		const reasons = await reencodeTextures(small, policy({ maxTextureSide: 30 }), emptyStats(0))
		expect(reasons.map((reason) => reason.code)).to.deep.equal(['IMAGE_DECODE_FAILED'])
	})

	it('KTX2 goes through untouched and is not counted', async () => {
		const doc = new Document()
		const ktx = makeKtx2(16, 16)
		doc.createTexture('k').setMimeType('image/ktx2').setImage(ktx)
		const stats = emptyStats(0)
		expect(await reencodeTextures(doc, policy(), stats)).to.deep.equal([])
		expect(doc.getRoot().listTextures()[0]?.getImage()).to.equal(ktx)
		expect(stats.texturesReencoded).to.equal(0)
	})

	it('a texture that does not decode is IMAGE_DECODE_FAILED with its position, and the rest still run', async () => {
		const doc = new Document()
		doc
			.createTexture('good')
			.setMimeType('image/png')
			.setImage(await makeImage('png'))
		doc
			.createTexture('bad')
			.setMimeType('image/png')
			.setImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]))
		const stats = emptyStats(0)
		expect(await reencodeTextures(doc, policy(), stats)).to.deep.equal([
			{ code: 'IMAGE_DECODE_FAILED', message: 'texture 1 could not be decoded and re-encoded' }
		])
		expect(stats.texturesReencoded).to.equal(1)
	})

	it('bytes in no known format, and a texture with no image, are IMAGE_DECODE_FAILED', async () => {
		const doc = new Document()
		doc.createTexture('text').setMimeType('image/png').setImage(new TextEncoder().encode('not an image'))
		doc.createTexture('empty')
		const reasons = await reencodeTextures(doc, policy(), emptyStats(0))
		expect(reasons.map((reason) => reason.message)).to.deep.equal([
			'texture 0 could not be decoded and re-encoded',
			'texture 1 could not be decoded and re-encoded'
		])
	})

	it('a document without textures gives no reasons', async () => {
		expect(await reencodeTextures(new Document(), policy(), emptyStats(0))).to.deep.equal([])
	})
})
