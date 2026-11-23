import { WebIO } from '@gltf-transform/core'
import { expect } from 'chai'
import sinon from 'sinon'

import type { IGlbAccepted, IGlbSanitiseResult } from '../../dist/files/IGlbSanitiseResult.mjs'
import { sanitiseGlb } from '../../dist/files/sanitiseGlb.mjs'
import { buildGlb, makeImage, packGlb, splitGlb } from '../helpers/glbFixtures.mjs'

const acceptedOf = (result: IGlbSanitiseResult): IGlbAccepted => {
	expect(result.accepted, JSON.stringify(result.reasons)).to.equal(true)
	if (!result.accepted) throw new Error('rejected')
	return result
}

const hasKey = (value: unknown, key: string): boolean =>
	typeof value === 'object' && value !== null && (key in value || Object.values(value).some((child) => hasKey(child, key)))

describe('files/sanitiseGlb: valid models', function () {
	this.timeout(60_000)
	afterEach(() => sinon.restore())

	describe('what comes back', () => {
		it('a fresh GLB: magic, version 2, header length, one JSON chunk then one BIN chunk', async () => {
			const out = acceptedOf(await sanitiseGlb(await buildGlb({ triangles: 20 }))).glb
			const view = new DataView(out.buffer, out.byteOffset, out.byteLength)
			expect(view.getUint32(0, true)).to.equal(0x46546c67)
			expect(view.getUint32(4, true)).to.equal(2)
			expect(view.getUint32(8, true)).to.equal(out.length)
			expect(view.getUint32(16, true)).to.equal(0x4e4f534a)
			const { json, bin } = splitGlb(out)
			expect(json['asset'].version).to.equal('2.0')
			expect(bin?.length).to.be.greaterThan(0)
		})

		it('reasons is an empty array, stats are filled', async () => {
			const input = await buildGlb({
				triangles: 20,
				nodes: 3,
				textures: [
					{ format: 'png', width: 32, height: 16 },
					{ format: 'jpeg', width: 8, height: 8 }
				]
			})
			const result = acceptedOf(await sanitiseGlb(input))
			expect(result.reasons).to.deep.equal([])
			expect(result.stats).to.deep.equal({
				inputBytes: input.length,
				outputBytes: result.glb.length,
				nodes: 3,
				meshes: 1,
				materials: 1,
				textures: 2,
				animations: 0,
				accessors: 2,
				triangles: 60,
				vertices: 180,
				bufferBytes: splitGlb(input).json['buffers'][0].byteLength,
				maxTextureSide: 32,
				texturesReencoded: 2
			})
		})

		it('does not change the input', async () => {
			const input = await buildGlb({ extras: true, textures: [{ format: 'png' }] })
			const copy = new Uint8Array(input)
			await sanitiseGlb(input)
			expect(Buffer.from(input).equals(Buffer.from(copy))).to.equal(true)
		})

		it('takes a Buffer, and a view into a bigger buffer (offset and length of the view are honoured)', async () => {
			const input = await buildGlb({ triangles: 5 })
			expect((await sanitiseGlb(Buffer.from(input))).accepted).to.equal(true)
			const padded = new Uint8Array(input.length + 100)
			padded.set(input, 50)
			expect((await sanitiseGlb(padded.subarray(50, 50 + input.length))).accepted).to.equal(true)
		})

		it('works on a private copy: the caller may change its array right after the call', async () => {
			const input = await buildGlb({ triangles: 5, extras: true })
			const copy = new Uint8Array(input)
			const pending = sanitiseGlb(input)
			input.fill(0)
			const out = acceptedOf(await pending)
			expect(out.stats.inputBytes).to.equal(copy.length)
			expect(Buffer.from(out.glb).equals(Buffer.from(acceptedOf(await sanitiseGlb(copy)).glb))).to.equal(true)
		})

		it('a second pass accepts the output of the first; lossless content comes out byte for byte the same', async () => {
			const lossless = acceptedOf(
				await sanitiseGlb(await buildGlb({ extras: true, triangles: 40, textures: [{ format: 'png' }] }))
			)
			expect(Buffer.from(acceptedOf(await sanitiseGlb(lossless.glb)).glb).equals(Buffer.from(lossless.glb))).to.equal(true)
			const lossy = acceptedOf(
				await sanitiseGlb(await buildGlb({ triangles: 40, textures: [{ format: 'jpeg' }, { format: 'webp' }] }))
			)
			const again = acceptedOf(await sanitiseGlb(lossy.glb))
			expect(again.stats.triangles).to.equal(lossy.stats.triangles)
			expect(again.stats.texturesReencoded).to.equal(2)
		})

		it('the output reads back as the same model', async () => {
			const out = acceptedOf(await sanitiseGlb(await buildGlb({ triangles: 12, nodes: 2 }))).glb
			const doc = await new WebIO().readBinary(out)
			expect(doc.getRoot().listNodes()).to.have.length(2)
			expect(doc.getRoot().listAccessors()[0]?.getCount()).to.equal(36)
		})
	})

	describe('what goes', () => {
		it('every extras, in every property', async () => {
			const input = await buildGlb({ extras: true, textures: [{ format: 'png' }] })
			expect(hasKey(splitGlb(input).json, 'extras')).to.equal(true)
			expect(hasKey(splitGlb(acceptedOf(await sanitiseGlb(input)).glb).json, 'extras')).to.equal(false)
		})

		it('the extras text is not left anywhere in the bytes', async () => {
			const out = acceptedOf(await sanitiseGlb(await buildGlb({ extras: true }))).glb
			expect(Buffer.from(out).includes('extras-payload')).to.equal(false)
		})

		it('EXIF in an embedded JPEG', async () => {
			const input = await buildGlb({ extras: true, textures: [{ format: 'jpeg', width: 16, height: 16 }] })
			expect(Buffer.from(input).includes('secret-exif')).to.equal(true)
			expect(Buffer.from(acceptedOf(await sanitiseGlb(input)).glb).includes('secret-exif')).to.equal(false)
		})

		it('a payload hidden after the image data', async () => {
			const base = await buildGlb({ textures: [{ format: 'png', width: 16, height: 16 }] })
			const { json, bin } = splitGlb(base)
			const png = await makeImage('png', 16, 16)
			const polyglot = new Uint8Array([...png, ...new TextEncoder().encode('<script>EVIL()</script>')])
			const start = bin?.length ?? 0
			const grown = new Uint8Array(start + polyglot.length + 4)
			grown.set(bin ?? new Uint8Array())
			grown.set(polyglot, start)
			json['bufferViews'].push({ buffer: 0, byteOffset: start, byteLength: polyglot.length })
			json['images'][0] = { bufferView: json['bufferViews'].length - 1, mimeType: 'image/png' }
			json['buffers'][0].byteLength = grown.length
			expect(Buffer.from(packGlb(json, grown)).includes('EVIL')).to.equal(true)
			const out = acceptedOf(await sanitiseGlb(packGlb(json, grown)))
			expect(Buffer.from(out.glb).includes('EVIL')).to.equal(false)
			expect(out.stats.texturesReencoded).to.equal(1)
		})

		it('a material no mesh uses', async () => {
			const out = acceptedOf(await sanitiseGlb(await buildGlb({ unusedMaterial: true })))
			expect(splitGlb(out.glb).json['materials']).to.have.length(1)
			expect(out.stats.materials).to.equal(2)
		})
	})

	describe('what stays', () => {
		it('names and the shape of the scene', async () => {
			const { json } = splitGlb(acceptedOf(await sanitiseGlb(await buildGlb({ nodes: 2 }))).glb)
			expect(json['nodes'].map((node: { name: string }) => node.name)).to.deep.equal(['node-0', 'node-1'])
			expect(json['scenes'][0].nodes).to.deep.equal([0, 1])
		})

		it('a sparse accessor, read back with the same values', async () => {
			const out = acceptedOf(await sanitiseGlb(await buildGlb({ sparse: true, triangles: 10 }))).glb
			const uv = (await new WebIO().readBinary(out)).getRoot().listAccessors()[1]
			const values = Array.from(uv?.getArray() ?? [])
			expect(values).to.have.length(60)
			expect(values[1]).to.equal(1)
			expect(values[5]).to.equal(2)
			expect(values.filter((value) => value !== 0)).to.have.length(2)
		})

		it('an allowed material extension (KHR_materials_clearcoat)', async () => {
			const { json } = splitGlb(acceptedOf(await sanitiseGlb(await buildGlb({ clearcoat: true }))).glb)
			expect(json['extensionsUsed']).to.include('KHR_materials_clearcoat')
			expect(json['materials'][0].extensions.KHR_materials_clearcoat.clearcoatFactor).to.equal(0.5)
		})

		it('the extension is dropped when the caller does not allow it', async () => {
			const result = await sanitiseGlb(await buildGlb({ clearcoat: true }), { allowedExtensions: ['KHR_materials_unlit'] })
			expect(result.accepted).to.equal(false)
			expect(result.reasons.map((reason) => reason.code)).to.deep.equal(['EXTENSION_NOT_ALLOWED'])
		})

		it('a solid-colour texture is kept as a texture', async () => {
			const out = acceptedOf(await sanitiseGlb(await buildGlb({ textures: [{ format: 'png', width: 4, height: 4 }] })))
			expect(splitGlb(out.glb).json['textures']).to.have.length(1)
		})

		it('a model that came in meshopt compressed goes out meshopt compressed, and decodes', async () => {
			const input = await buildGlb({ compress: true, triangles: 300 })
			const out = acceptedOf(await sanitiseGlb(input))
			expect(splitGlb(out.glb).json['extensionsRequired']).to.include('EXT_meshopt_compression')
			expect(out.stats.triangles).to.equal(300)
			expect(out.stats.bufferBytes).to.be.greaterThan(splitGlb(input).json['buffers'][0].byteLength - 1)
		})

		it('textures of every format, and a KTX2 header', async () => {
			for (const format of ['png', 'jpeg', 'webp', 'ktx2'] as const) {
				const result = acceptedOf(await sanitiseGlb(await buildGlb({ textures: [{ format, width: 32, height: 32 }] })))
				expect(result.stats.maxTextureSide, format).to.equal(32)
				expect(result.stats.texturesReencoded, format).to.equal(format === 'ktx2' ? 0 : 1)
			}
		})

		it('a model with every feature at once', async () => {
			const input = await buildGlb({
				extras: true,
				compress: true,
				clearcoat: true,
				triangles: 200,
				nodes: 4,
				unusedMaterial: true,
				textures: [{ format: 'png' }, { format: 'jpeg' }, { format: 'webp' }]
			})
			const result = acceptedOf(await sanitiseGlb(input))
			expect(result.stats.texturesReencoded).to.equal(3)
			expect(result.glb.length).to.be.greaterThan(0)
		})

		it('a scene with no meshes: just the asset block', async () => {
			expect(acceptedOf(await sanitiseGlb(packGlb({ asset: { version: '2.0' } }))).stats.nodes).to.equal(0)
		})

		it('a custom limit above the default is honoured', async () => {
			const glb = await buildGlb({ triangles: 600_000, vertices: 1000 })
			expect((await sanitiseGlb(glb)).accepted).to.equal(false)
			expect((await sanitiseGlb(glb, { maxTriangles: 600_000, maxAccessorElements: 1_800_000 })).accepted).to.equal(true)
		})
	})

	describe('misuse throws, a hostile file does not', () => {
		it('input that is not a Uint8Array is a TypeError', async () => {
			for (const input of ['glTF', 5, null, undefined, {}, [1, 2, 3], new ArrayBuffer(40)]) {
				let caught: unknown
				try {
					await sanitiseGlb(input as unknown as Uint8Array)
				} catch (e) {
					caught = e
				}
				expect(caught, String(input)).to.be.instanceOf(TypeError)
				expect((caught as Error).message).to.equal('sanitiseGlb: input must be a Uint8Array or a Buffer')
			}
		})

		it('an invalid option is a TypeError, and a name the sanitiser cannot rewrite a RangeError', async () => {
			const input = await buildGlb()
			const run = async (options: object) => {
				try {
					await sanitiseGlb(input, options)
				} catch (e) {
					return e
				}
				return undefined
			}
			expect(await run({ maxNodes: 0 })).to.be.instanceOf(TypeError)
			expect(await run({ nope: 1 })).to.be.instanceOf(TypeError)
			expect(await run({ allowedExtensions: ['KHR_draco_mesh_compression'] })).to.be.instanceOf(RangeError)
		})

		it('options are checked before the input, so a bad option fails on any file', async () => {
			let caught: unknown
			try {
				await sanitiseGlb(new Uint8Array(), { maxNodes: -1 })
			} catch (e) {
				caught = e
			}
			expect(caught).to.be.instanceOf(TypeError)
		})
	})

	describe('the second look at the output', () => {
		it('OUTPUT_INVALID when the written file does not read back', async () => {
			const original = WebIO.prototype.readBinary
			const read = sinon.stub(WebIO.prototype, 'readBinary')
			read.onFirstCall().callsFake(function (this: WebIO, buffer: Uint8Array) {
				return original.call(this, buffer)
			})
			read.onSecondCall().rejects(new Error('no'))
			const result = await sanitiseGlb(await buildGlb())
			expect(result.accepted).to.equal(false)
			expect(result.reasons).to.deep.equal([{ code: 'OUTPUT_INVALID', message: 'the sanitised file does not decode' }])
			expect(result.stats.outputBytes).to.equal(0)
		})
	})
})
