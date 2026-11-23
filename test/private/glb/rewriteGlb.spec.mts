import { createGlbIo } from '@private/glb/glbIo.mjs'
import { emptyStats } from '@private/glb/glbStats.mjs'
import { rewriteGlb } from '@private/glb/rewriteGlb.mjs'
import { expect } from 'chai'
import sharp from 'sharp'

import { GLB_POLICY_DEFAULTS } from '../../../dist/files/GLB_POLICY_DEFAULTS.mjs'
import { buildDocument, buildGlb, makeIo, packGlb, patchGlbJson, splitGlb } from '../../helpers/glbFixtures.mjs'

const run = async (glb: Uint8Array, allowed: readonly string[] = GLB_POLICY_DEFAULTS.allowedExtensions) => {
	const io = await createGlbIo(allowed)
	const stats = emptyStats(glb.length)
	return { result: await rewriteGlb(io, glb, { ...GLB_POLICY_DEFAULTS, allowedExtensions: allowed }, stats), stats }
}

const written = async (glb: Uint8Array) => {
	const { result } = await run(glb)
	if (result.glb === null) throw new Error(JSON.stringify(result.reasons))
	return result.glb
}

const hasKey = (value: unknown, key: string): boolean =>
	typeof value === 'object' && value !== null && (key in value || Object.values(value).some((child) => hasKey(child, key)))

describe('private/glb/rewriteGlb', () => {
	it('writes a new GLB of the same model', async () => {
		const out = await written(await buildGlb({ triangles: 12 }))
		const { json } = splitGlb(out)
		expect(json['asset'].version).to.equal('2.0')
		expect(json['accessors'][0].count).to.equal(36)
		expect(json['nodes']).to.have.length(1)
		expect(json['buffers']).to.have.length(1)
		expect(json['buffers'][0].uri).to.equal(undefined)
	})

	it('drops every extras, root and nested', async () => {
		const input = await buildGlb({ extras: true, textures: [{ format: 'png' }] })
		expect(hasKey(splitGlb(input).json, 'extras')).to.equal(true)
		expect(hasKey(splitGlb(await written(input)).json, 'extras')).to.equal(false)
	})

	it('keeps names', async () => {
		const { json } = splitGlb(await written(await buildGlb({ extras: true })))
		expect(json['nodes'][0].name).to.equal('node-0')
		expect(json['meshes'][0].name).to.equal('mesh')
		expect(json['materials'][0].name).to.equal('mat')
	})

	it('drops unused data: a material no primitive uses', async () => {
		const input = await buildGlb({ unusedMaterial: true })
		expect(splitGlb(input).json['materials']).to.have.length(2)
		expect(splitGlb(await written(input)).json['materials']).to.have.length(1)
	})

	it('drops an accessor nothing points at', async () => {
		const doc = await buildDocument()
		doc
			.createAccessor('orphan')
			.setType('SCALAR')
			.setArray(new Float32Array(100))
			.setBuffer(doc.getRoot().listBuffers()[0] as never)
		const glb = await (await makeIo()).writeBinary(doc)
		expect(splitGlb(glb).json['accessors']).to.have.length(3)
		expect(splitGlb(await written(glb)).json['accessors']).to.have.length(2)
	})

	it('keeps an empty node, a vertex attribute no texture uses, and a solid-colour texture', async () => {
		const doc = await buildDocument()
		doc.getRoot().listScenes()[0]?.addChild(doc.createNode('locator'))
		const solid = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } })
			.png()
			.toBuffer()
		doc
			.getRoot()
			.listMaterials()[0]
			?.setBaseColorTexture(doc.createTexture('solid').setMimeType('image/png').setImage(new Uint8Array(solid)))
		const out = splitGlb(await written(await (await makeIo()).writeBinary(doc))).json
		expect(out['nodes'].map((node: { name: string }) => node.name)).to.include('locator')
		expect(out['meshes'][0].primitives[0].attributes).to.have.property('TEXCOORD_0')
		expect(out['textures']).to.have.length(1)
		expect(out['materials'][0].pbrMetallicRoughness).to.have.property('baseColorTexture')
	})

	it('re-encodes the textures and counts them', async () => {
		const { result, stats } = await run(
			await buildGlb({ textures: [{ format: 'png' }, { format: 'jpeg', width: 32, height: 32 }] })
		)
		expect(result.glb).to.be.instanceOf(Uint8Array)
		expect(stats.texturesReencoded).to.equal(2)
	})

	it('a model that came in with meshopt goes out with meshopt, required, and decodes', async () => {
		const input = await buildGlb({ compress: true, triangles: 300 })
		const out = await written(input)
		const { json } = splitGlb(out)
		expect(json['extensionsUsed']).to.include('EXT_meshopt_compression')
		expect(json['extensionsRequired']).to.include('EXT_meshopt_compression')
		const before = (await (await createGlbIo(['EXT_meshopt_compression', 'KHR_mesh_quantization'])).readBinary(input))
			.getRoot()
			.listAccessors()
		const after = (await (await createGlbIo(['EXT_meshopt_compression', 'KHR_mesh_quantization'])).readBinary(out))
			.getRoot()
			.listAccessors()
		expect(after).to.have.length(before.length)
		for (const [index, accessor] of before.entries()) {
			expect(Array.from(after[index]?.getArray() ?? []), String(index)).to.deep.equal(Array.from(accessor.getArray() ?? []))
		}
	})

	it('a model without meshopt goes out without it', async () => {
		const { json } = splitGlb(await written(await buildGlb()))
		expect(json['extensionsUsed'] ?? []).to.not.include('EXT_meshopt_compression')
	})

	it('an optional meshopt extension becomes required in the output', async () => {
		const input = patchGlbJson(await buildGlb({ compress: true, triangles: 300 }), (json) => {
			json['extensionsRequired'] = []
		})
		const { json } = splitGlb(await written(input))
		expect(json['extensionsRequired']).to.deep.equal(['EXT_meshopt_compression'])
	})

	it('drops an extension that is not allowed instead of keeping data nobody checked', async () => {
		const { result } = await run(await buildGlb({ clearcoat: true }), ['KHR_materials_unlit'])
		const { json } = splitGlb(result.glb ?? new Uint8Array())
		expect(hasKey(json, 'KHR_materials_clearcoat')).to.equal(false)
	})

	it('MESHOPT_DECODE_FAILED when the compressed stream does not decode', async () => {
		const input = await buildGlb({ compress: true, triangles: 300 })
		const { json, bin } = splitGlb(input)
		const view = json['bufferViews'].find((candidate: Record<string, any>) => candidate['extensions']?.EXT_meshopt_compression)
		const { byteOffset, byteLength } = view.extensions.EXT_meshopt_compression
		const start = input.length - (bin?.length ?? 0) + byteOffset
		const broken = new Uint8Array(input)
		broken.fill(0xff, start, start + byteLength)
		const { result } = await run(broken)
		expect(result).to.deep.equal({
			glb: null,
			reasons: [{ code: 'MESHOPT_DECODE_FAILED', message: 'the EXT_meshopt_compression data does not decode' }]
		})
	})

	it('READ_FAILED when the reader throws for another reason', async () => {
		const noBin = packGlb({
			asset: { version: '2.0' },
			buffers: [{ byteLength: 8 }],
			bufferViews: [{ buffer: 0, byteLength: 8 }],
			accessors: [{ bufferView: 0, componentType: 5126, count: 2, type: 'SCALAR' }]
		})
		const { result } = await run(noBin)
		expect(result).to.deep.equal({
			glb: null,
			reasons: [{ code: 'READ_FAILED', message: 'the glTF reader could not read the file' }]
		})
	})

	it('a texture that does not decode gives its reason and no file', async () => {
		const input = await buildGlb({ textures: [{ format: 'png' }] })
		const { json } = splitGlb(input)
		const view = json['bufferViews'][json['images'][0].bufferView]
		const broken = new Uint8Array(input)
		const start = input.length - (splitGlb(input).bin?.length ?? 0) + view.byteOffset
		broken.fill(0x00, start + 40, start + view.byteLength)
		const { result } = await run(broken)
		expect(result.glb).to.equal(null)
		expect(result.reasons.map((reason) => reason.code)).to.deep.equal(['IMAGE_DECODE_FAILED'])
	})

	it('never throws on a file the reader cannot parse at all', async () => {
		const { result } = await run(new Uint8Array(40))
		expect(result.glb).to.equal(null)
		expect(result.reasons[0]?.code).to.equal('READ_FAILED')
	})
})
