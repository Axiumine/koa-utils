import { expect } from 'chai'

import type { IGlbRejectCode } from '../../dist/files/GLB_REJECT_CODES.mjs'
import type { IGlbReason, IGlbSanitiseResult } from '../../dist/files/IGlbSanitiseResult.mjs'
import { sanitiseGlb } from '../../dist/files/sanitiseGlb.mjs'
import {
	buildGlb,
	glbWithImage,
	makeBombPng,
	makeImage,
	packChunks,
	packGlb,
	patchGlbJson,
	splitGlb
} from '../helpers/glbFixtures.mjs'

const rejectedOf = (result: IGlbSanitiseResult): IGlbReason[] => {
	expect(result.accepted, JSON.stringify(result.reasons)).to.equal(false)
	expect(result).to.not.have.property('glb')
	expect(result.stats.outputBytes).to.equal(0)
	return result.reasons
}

const codesOf = (reasons: IGlbReason[]): IGlbRejectCode[] => reasons.map((reason) => reason.code)

describe('files/sanitiseGlb: hostile files are rejected, never thrown on', function () {
	this.timeout(60_000)

	describe('container', () => {
		it('too short, bad magic, bad version, wrong length', async () => {
			const good = await buildGlb()
			expect(codesOf(rejectedOf(await sanitiseGlb(new Uint8Array())))).to.deep.equal(['GLB_TRUNCATED'])
			const magic = new Uint8Array(good)
			magic[0] = 0x58
			expect(codesOf(rejectedOf(await sanitiseGlb(magic)))).to.deep.equal(['GLB_BAD_MAGIC'])
			const version = new Uint8Array(good)
			version[4] = 1
			expect(codesOf(rejectedOf(await sanitiseGlb(version)))).to.deep.equal(['GLB_BAD_VERSION'])
			expect(codesOf(rejectedOf(await sanitiseGlb(good.subarray(0, good.length - 4))))).to.deep.equal(['GLB_LENGTH_MISMATCH'])
		})

		it('too large, from the maxBytes option', async () => {
			const good = await buildGlb()
			const result = await sanitiseGlb(good, { maxBytes: good.length - 1 })
			expect(rejectedOf(result)[0]).to.deep.equal({
				code: 'GLB_TOO_LARGE',
				message: `the file has ${good.length} bytes, the limit is ${good.length - 1}`
			})
			expect(result.stats.inputBytes).to.equal(good.length)
		})

		it('bad chunk layout, and a JSON chunk over maxJsonBytes', async () => {
			const good = await buildGlb()
			const wrongType = new Uint8Array(good)
			wrongType[16] = 0x41
			expect(codesOf(rejectedOf(await sanitiseGlb(wrongType)))).to.deep.equal(['GLB_BAD_CHUNKS'])
			expect(codesOf(rejectedOf(await sanitiseGlb(good, { maxJsonBytes: 100 })))).to.deep.equal(['GLB_JSON_TOO_LARGE'])
		})

		it('a rejected container leaves every count at 0', async () => {
			const result = await sanitiseGlb(new Uint8Array(30))
			expect(result.stats).to.deep.equal({
				inputBytes: 30,
				outputBytes: 0,
				nodes: 0,
				meshes: 0,
				materials: 0,
				textures: 0,
				animations: 0,
				accessors: 0,
				triangles: 0,
				vertices: 0,
				bufferBytes: 0,
				maxTextureSide: 0,
				texturesReencoded: 0
			})
		})
	})

	describe('JSON chunk', () => {
		it('JSON_INVALID for text that is not JSON, not UTF-8, or not an object', async () => {
			for (const text of ['{"asset":', 'null', '[1,2]', '"str"', '42']) {
				expect(codesOf(rejectedOf(await sanitiseGlb(packGlb(text)))), text).to.deep.equal(['JSON_INVALID'])
			}
			expect(
				codesOf(rejectedOf(await sanitiseGlb(packChunks(Uint8Array.of(0x7b, 0xff, 0xfe, 0x7d))))),
				'bad UTF-8'
			).to.deep.equal(['JSON_INVALID'])
		})
	})

	describe('URIs: nothing may point outside the file', () => {
		const uris = [
			'../../etc/passwd',
			'..\\..\\secret.bin',
			'/etc/passwd',
			'C:\\Windows\\win.ini',
			'file:///etc/passwd',
			'https://evil.example/x.png',
			'http://169.254.169.254/latest/meta-data',
			'//evil.example/x',
			'texture.png',
			''
		]

		for (const uri of uris) {
			it(`image uri ${JSON.stringify(uri)}`, async () => {
				const glb = packGlb({ asset: { version: '2.0' }, images: [{ uri }] })
				expect(rejectedOf(await sanitiseGlb(glb))).to.deep.equal([
					{
						code: 'URI_EXTERNAL',
						pointer: '/images/0/uri',
						message: 'images[0] points at an external resource, only the embedded GLB buffer is allowed'
					}
				])
			})
		}

		it('buffer uri, external and data', async () => {
			const glb = packGlb({
				asset: { version: '2.0' },
				buffers: [
					{ byteLength: 4, uri: '../model.bin' },
					{ byteLength: 4, uri: 'data:application/octet-stream;base64,AAAAAA==' }
				]
			})
			expect(rejectedOf(await sanitiseGlb(glb)).map((reason) => `${reason.code} ${reason.pointer ?? ''}`)).to.deep.equal([
				'URI_EXTERNAL /buffers/0/uri',
				'URI_DATA /buffers/1/uri'
			])
		})

		it('data: URI image, in any case, is URI_DATA', async () => {
			for (const uri of ['data:image/png;base64,iVBORw0KGgo=', 'DATA:image/png;base64,iVBORw0KGgo=', 'Data:,x']) {
				expect(
					codesOf(rejectedOf(await sanitiseGlb(packGlb({ asset: { version: '2.0' }, images: [{ uri }] })))),
					uri
				).to.deep.equal(['URI_DATA'])
			}
		})

		it('a real model with one external image added is rejected', async () => {
			const glb = patchGlbJson(await buildGlb({ textures: [{ format: 'png' }] }), (json) => {
				json['images'][0].uri = '../../etc/passwd'
			})
			expect(codesOf(rejectedOf(await sanitiseGlb(glb)))).to.include('URI_EXTERNAL')
		})
	})

	describe('extensions', () => {
		it('KHR_interactivity is EXTENSION_FORBIDDEN, used, required or only in the root', async () => {
			const used = packGlb({ asset: { version: '2.0' }, extensionsUsed: ['KHR_interactivity'] })
			const required = packGlb({
				asset: { version: '2.0' },
				extensionsUsed: ['KHR_interactivity'],
				extensionsRequired: ['KHR_interactivity']
			})
			const root = packGlb({ asset: { version: '2.0' }, extensions: { KHR_interactivity: { graphs: [] } } })
			for (const glb of [used, required, root]) {
				expect(rejectedOf(await sanitiseGlb(glb))).to.deep.equal([
					{ code: 'EXTENSION_FORBIDDEN', message: 'KHR_interactivity is never allowed' }
				])
			}
		})

		it('a name outside the allowlist is EXTENSION_NOT_ALLOWED, Draco and unknown ones too', async () => {
			for (const name of ['KHR_draco_mesh_compression', 'FOO_bar', 'KHR_lights_punctual']) {
				const glb = packGlb({ asset: { version: '2.0' }, extensionsUsed: [name] })
				expect(rejectedOf(await sanitiseGlb(glb)), name).to.deep.equal([
					{ code: 'EXTENSION_NOT_ALLOWED', message: `${name} is not in allowedExtensions` }
				])
			}
		})

		it('a supported extension is allowed once the caller lists it', async () => {
			const glb = packGlb({
				asset: { version: '2.0' },
				extensionsUsed: ['KHR_lights_punctual'],
				extensions: { KHR_lights_punctual: { lights: [{ type: 'point' }] } },
				nodes: [{ extensions: { KHR_lights_punctual: { light: 0 } } }],
				scenes: [{ nodes: [0] }]
			})
			expect((await sanitiseGlb(glb)).accepted).to.equal(false)
			expect((await sanitiseGlb(glb, { allowedExtensions: ['KHR_lights_punctual'] })).accepted).to.equal(true)
		})

		it('an extension the file uses without declaring is a validator error', async () => {
			const glb = patchGlbJson(await buildGlb({ clearcoat: true }), (json) => {
				delete json['extensionsUsed']
			})
			expect(codesOf(rejectedOf(await sanitiseGlb(glb)))).to.include('VALIDATOR_ERROR')
		})
	})

	describe('limits', () => {
		it('1 000 000 triangles', async () => {
			const result = await sanitiseGlb(await buildGlb({ triangles: 1_000_000, vertices: 1000 }))
			const reasons = rejectedOf(result)
			expect(reasons.map((reason) => reason.limit)).to.include('maxTriangles')
			expect(result.stats.triangles).to.equal(1_000_000)
		})

		it('500 000 triangles are fine, one more is not (instanced counts every instance)', async () => {
			const glb = await buildGlb({ triangles: 5000, vertices: 300, nodes: 100 })
			expect((await sanitiseGlb(glb)).accepted).to.equal(true)
			const over = rejectedOf(await sanitiseGlb(await buildGlb({ triangles: 5000, vertices: 300, nodes: 101 })))
			expect(over.map((reason) => reason.limit)).to.deep.equal(['maxTriangles'])
		})

		it('too many vertices', async () => {
			const glb = await buildGlb({ triangles: 10, vertices: 30, nodes: 10 })
			expect(rejectedOf(await sanitiseGlb(glb, { maxVertices: 299 })).map((reason) => reason.limit)).to.deep.equal([
				'maxVertices'
			])
			expect((await sanitiseGlb(glb, { maxVertices: 300 })).accepted).to.equal(true)
		})

		it('sparse accessor with a huge count, and a huge dense count', async () => {
			const sparse = patchGlbJson(await buildGlb({ sparse: true }), (json) => {
				const accessor = json['accessors'].find((candidate: Record<string, any>) => candidate['sparse'])
				accessor.sparse.count = 1_000_000_000
			})
			expect(rejectedOf(await sanitiseGlb(sparse)).map((reason) => reason.limit)).to.include('maxSparseElements')
			const dense = patchGlbJson(await buildGlb(), (json) => {
				json['accessors'][0].count = 2_000_000_000
			})
			expect(rejectedOf(await sanitiseGlb(dense)).map((reason) => reason.limit)).to.include('maxAccessorElements')
		})

		it('a buffer that declares far more bytes than the limit', async () => {
			const glb = patchGlbJson(await buildGlb(), (json) => {
				json['buffers'][0].byteLength = 4_000_000_000
			})
			expect(rejectedOf(await sanitiseGlb(glb)).map((reason) => reason.limit)).to.include('maxBufferBytes')
		})

		it('counts: nodes, meshes, materials, textures, animations, accessors', async () => {
			const bag = { asset: { version: '2.0' } }
			const many = (n: number) => Array.from({ length: n }, () => ({}))
			const cases: [string, Record<string, unknown>, Record<string, number>][] = [
				['maxNodes', { nodes: many(3) }, { maxNodes: 2 }],
				['maxMeshes', { meshes: many(3) }, { maxMeshes: 2 }],
				['maxMaterials', { materials: many(3) }, { maxMaterials: 2 }],
				['maxTextures', { textures: many(3) }, { maxTextures: 2 }],
				['maxAnimations', { animations: many(3) }, { maxAnimations: 2 }],
				['maxAccessors', { accessors: many(3) }, { maxAccessors: 2 }]
			]
			for (const [limit, extra, options] of cases) {
				const reasons = rejectedOf(await sanitiseGlb(packGlb({ ...bag, ...extra }), options))
				expect(
					reasons.map((reason) => reason.limit),
					limit
				).to.deep.equal([limit])
			}
		})

		it('reasons are capped at 20, so a hostile file cannot make a huge report', async () => {
			const glb = packGlb({ asset: { version: '2.0' }, images: Array.from({ length: 500 }, (_, i) => ({ uri: `../${i}.png` })) })
			expect(rejectedOf(await sanitiseGlb(glb))).to.have.length(20)
		})

		it('reports reasons from several families together', async () => {
			const glb = packGlb({
				asset: { version: '2.0' },
				extensionsUsed: ['KHR_interactivity'],
				images: [{ uri: '../x.png' }],
				nodes: [{}, {}, {}]
			})
			expect(codesOf(rejectedOf(await sanitiseGlb(glb, { maxNodes: 2 })))).to.deep.equal([
				'URI_EXTERNAL',
				'EXTENSION_FORBIDDEN',
				'LIMIT_EXCEEDED'
			])
		})
	})

	describe('textures', () => {
		it('texture bomb: a 100 000 x 100 000 header in 33 bytes', async () => {
			const result = await sanitiseGlb(glbWithImage(makeBombPng(100_000, 100_000)))
			expect(rejectedOf(result).map((reason) => reason.limit)).to.deep.equal(['maxTextureSide', 'maxTexturePixels'])
			expect(result.stats.maxTextureSide).to.equal(100_000)
		})

		it('a 65 535 x 65 535 JPEG-sized claim is rejected too', async () => {
			expect(rejectedOf(await sanitiseGlb(glbWithImage(makeBombPng(65_535, 1)))).map((reason) => reason.limit)).to.deep.equal([
				'maxTextureSide'
			])
		})

		it('a real 4096 x 4096 texture is over the default side of 2048', async () => {
			const result = await sanitiseGlb(glbWithImage(await makeImage('png', 4096, 4096)))
			expect(rejectedOf(result)).to.deep.equal([
				{ code: 'LIMIT_EXCEEDED', limit: 'maxTextureSide', message: 'images[0]: 4096 is over the limit maxTextureSide = 2048' }
			])
			expect(result.stats.maxTextureSide).to.equal(4096)
		})

		it('a 4K texture passes when the caller raises the side limit, and comes back at 4K', async () => {
			const result = await sanitiseGlb(await buildGlb({ textures: [{ format: 'png', width: 4096, height: 64 }] }), {
				maxTextureSide: 4096
			})
			expect(result.accepted).to.equal(true)
			expect(result.stats.maxTextureSide).to.equal(4096)
		})

		it('the side limit is exact', async () => {
			const glb = await buildGlb({ textures: [{ format: 'png', width: 64, height: 40 }] })
			expect((await sanitiseGlb(glb, { maxTextureSide: 64 })).accepted).to.equal(true)
			expect(codesOf(rejectedOf(await sanitiseGlb(glb, { maxTextureSide: 63 })))).to.deep.equal(['LIMIT_EXCEEDED'])
		})

		it('bytes that are not an image, or an image of another format than it claims', async () => {
			expect(
				codesOf(rejectedOf(await sanitiseGlb(glbWithImage(new TextEncoder().encode('<svg onload=alert(1)/>')))))
			).to.deep.equal(['IMAGE_UNSUPPORTED'])
			expect(codesOf(rejectedOf(await sanitiseGlb(glbWithImage(await makeImage('png'), 'image/jpeg'))))).to.deep.equal([
				'IMAGE_FORMAT_MISMATCH'
			])
		})

		for (const format of ['png', 'jpeg'] as const) {
			it(`a ${format} cut short, with a good header: IMAGE_DECODE_FAILED from sharp, no repair`, async () => {
				const glb = patchGlbJson(await buildGlb({ textures: [{ format, width: 64, height: 64 }] }), (json) => {
					const view = json['bufferViews'][json['images'][0].bufferView]
					view.byteLength = Math.floor(view.byteLength * 0.6)
				})
				const result = await sanitiseGlb(glb)
				expect(rejectedOf(result)).to.deep.equal([
					{ code: 'IMAGE_DECODE_FAILED', message: 'texture 0 could not be decoded and re-encoded' }
				])
				expect(result.stats.texturesReencoded).to.equal(0)
			})
		}

		it('a texture nothing uses is dropped, not decoded', async () => {
			const result = await sanitiseGlb(glbWithImage(await makeImage('png', 16, 16)))
			expect(result.accepted).to.equal(true)
			expect(result.stats.texturesReencoded).to.equal(0)
		})

		it('an image with no bytes in the BIN chunk', async () => {
			const glb = packGlb({ asset: { version: '2.0' }, images: [{ mimeType: 'image/png' }] })
			expect(codesOf(rejectedOf(await sanitiseGlb(glb)))).to.deep.equal(['IMAGE_UNREADABLE'])
		})
	})

	describe('validator', () => {
		it('a node index outside the file is VALIDATOR_ERROR, with a pointer', async () => {
			const glb = patchGlbJson(await buildGlb(), (json) => {
				json['scenes'][0].nodes = [99]
			})
			const reasons = rejectedOf(await sanitiseGlb(glb))
			expect(reasons[0]?.code).to.equal('VALIDATOR_ERROR')
			expect(reasons[0]?.pointer).to.match(/^\/scenes\/0\/nodes\/0/)
		})

		it('a missing asset block, and a wrong glTF version', async () => {
			expect(codesOf(rejectedOf(await sanitiseGlb(packGlb({}))))).to.include('VALIDATOR_ERROR')
			expect(codesOf(rejectedOf(await sanitiseGlb(packGlb({ asset: { version: '1.0' } }))))).to.include('VALIDATOR_ERROR')
		})
	})

	describe('meshopt', () => {
		const corrupt = async (fill: number) => {
			const input = await buildGlb({ compress: true, triangles: 300 })
			const { json, bin } = splitGlb(input)
			const view = json['bufferViews'].find((candidate: Record<string, any>) => candidate['extensions']?.EXT_meshopt_compression)
			const { byteOffset, byteLength } = view.extensions.EXT_meshopt_compression
			const start = input.length - (bin?.length ?? 0) + byteOffset
			const broken = new Uint8Array(input)
			broken.fill(fill, start, start + byteLength)
			return broken
		}

		it('a compressed stream that does not decode is MESHOPT_DECODE_FAILED', async () => {
			expect(rejectedOf(await sanitiseGlb(await corrupt(0xff)))).to.deep.equal([
				{ code: 'MESHOPT_DECODE_FAILED', message: 'the EXT_meshopt_compression data does not decode' }
			])
		})

		it('a meshopt view that claims a gigantic decoded size is stopped by the buffer limit, before the decoder allocates it', async () => {
			const glb = patchGlbJson(await buildGlb({ compress: true, triangles: 300 }), (json) => {
				const view = json['bufferViews'].find(
					(candidate: Record<string, any>) => candidate['extensions']?.EXT_meshopt_compression
				)
				view.extensions.EXT_meshopt_compression.count = 1_000_000_000
			})
			expect(rejectedOf(await sanitiseGlb(glb)).map((reason) => reason.limit)).to.include('maxBufferBytes')
		})

		it('meshopt is rejected when the caller does not allow it', async () => {
			const glb = await buildGlb({ compress: true, triangles: 100 })
			expect(codesOf(rejectedOf(await sanitiseGlb(glb, { allowedExtensions: ['KHR_mesh_quantization'] })))).to.deep.equal([
				'EXTENSION_NOT_ALLOWED'
			])
		})
	})

	describe('robustness', () => {
		it('never throws on a valid file cut at any of 60 places, or with one byte flipped at 60 places', async () => {
			const good = await buildGlb({ textures: [{ format: 'png' }, { format: 'jpeg' }], triangles: 30 })
			const step = Math.ceil(good.length / 60)
			for (let at = 0; at < good.length; at += step) {
				const cut = await sanitiseGlb(good.subarray(0, at))
				expect(cut.accepted, `cut at ${at}`).to.equal(false)
				const flipped = new Uint8Array(good)
				flipped[at] = (flipped[at] ?? 0) ^ 0xff
				const result = await sanitiseGlb(flipped)
				expect(typeof result.accepted, `flip at ${at}`).to.equal('boolean')
			}
		})

		it('random bytes and an all-zero file are rejected, not thrown on', async () => {
			expect((await sanitiseGlb(new Uint8Array(5000))).accepted).to.equal(false)
			const noise = new Uint8Array(5000).map((_, i) => (i * 97 + 13) & 0xff)
			noise.set([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0])
			expect((await sanitiseGlb(noise)).accepted).to.equal(false)
		})
	})
})
