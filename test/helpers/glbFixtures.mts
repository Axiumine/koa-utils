// GLB fixtures built in-test w/ glTF Transform + sharp. No binary committed.
import {
	type Buffer as GltfBuffer,
	Document,
	Logger,
	type Material,
	type Primitive,
	type Texture,
	WebIO
} from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTTextureWebP, KHRMaterialsClearcoat, KHRTextureBasisu } from '@gltf-transform/extensions'
import { meshopt } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'

interface ITextureSpec {
	format: 'png' | 'jpeg' | 'webp' | 'ktx2'
	width?: number
	height?: number
}

export interface IFixtureOptions {
	/** triangles in the one mesh, default 10 */
	triangles?: number
	/** shared vertices, indexed mesh. Default: none shared, 3 per triangle */
	vertices?: number
	/** nodes instancing the mesh, default 1 */
	nodes?: number
	textures?: ITextureSpec[]
	/** extras on every property kind */
	extras?: boolean
	/** meshopt compress geometry */
	compress?: boolean
	/** extra material nobody uses */
	unusedMaterial?: boolean
	/** KHR_materials_clearcoat on the material */
	clearcoat?: boolean
	/** UV accessor stored sparse, 2 nonzero elements */
	sparse?: boolean
}

export const makeIo = async (): Promise<WebIO> => {
	await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready])
	return new WebIO()
		.setLogger(new Logger(Logger.Verbosity.SILENT))
		.registerExtensions(ALL_EXTENSIONS)
		.registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
}

// deterministic noise → not solid, not shrunk to nothing
const noise = (width: number, height: number, channels: 3 | 4): Buffer => {
	const raw = Buffer.alloc(width * height * channels)
	for (let i = 0; i < raw.length; i++) raw[i] = (i * 37 + (i >> 3)) & 0xff
	return raw
}

export async function makeImage(
	format: 'png' | 'jpeg' | 'webp',
	width = 16,
	height = 16,
	withExif = false
): Promise<Uint8Array> {
	let image = sharp(noise(width, height, 3), { raw: { width, height, channels: 3 } })
	if (withExif) image = image.withExif({ IFD0: { Copyright: 'secret-exif' } })
	const out = format === 'png' ? image.png() : format === 'jpeg' ? image.jpeg() : image.webp()
	return new Uint8Array(await out.toBuffer())
}

// minimal KTX2: header, level index, dummy level data. Not decodable, header only
export function makeKtx2(width: number, height: number, levels = 1): Uint8Array {
	const levelBytes = 16
	const dataStart = 80 + levels * 24
	const out = new Uint8Array(dataStart + levels * levelBytes)
	const view = new DataView(out.buffer)
	out.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a])
	view.setUint32(16, 1, true)
	view.setUint32(20, width, true)
	view.setUint32(24, height, true)
	view.setUint32(36, 1, true)
	view.setUint32(40, levels, true)
	view.setUint32(44, 1, true)
	view.setUint32(48, dataStart, true)
	for (let level = 0; level < levels; level++) {
		const at = 80 + level * 24
		view.setUint32(at, dataStart + level * levelBytes, true)
		view.setUint32(at + 8, levelBytes, true)
		view.setUint32(at + 16, levelBytes, true)
	}
	return out
}

// PNG header w/ claimed size, no pixel data. Header read only → bomb
export function makeBombPng(width: number, height: number): Uint8Array {
	const out = new Uint8Array(33)
	const view = new DataView(out.buffer)
	out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
	view.setUint32(8, 13)
	out.set([0x49, 0x48, 0x44, 0x52], 12)
	view.setUint32(16, width)
	view.setUint32(20, height)
	out.set([8, 2, 0, 0, 0], 24)
	return out
}

async function imageFor(spec: ITextureSpec, doc: Document, withExif: boolean): Promise<Texture> {
	const { format, width = 16, height = 16 } = spec
	const texture = doc.createTexture(`tex-${format}`)
	if (format === 'ktx2') return texture.setImage(makeKtx2(width, height)).setMimeType('image/ktx2')
	return texture.setImage(await makeImage(format, width, height, withExif)).setMimeType(`image/${format}`)
}

function fillUvs(count: number, sparse: boolean): Float32Array<ArrayBuffer> {
	const uvs = new Float32Array(count * 2)
	if (sparse) {
		uvs[1] = 1
		uvs[5] = 2
		return uvs
	}
	for (let i = 0; i < uvs.length; i++) uvs[i] = (i % 7) / 7
	return uvs
}

function buildPrimitive(doc: Document, buffer: GltfBuffer, options: IFixtureOptions): Primitive {
	const { triangles = 10, vertices, sparse = false } = options
	const count = vertices ?? triangles * 3
	const positions = new Float32Array(count * 3)
	for (let i = 0; i < positions.length; i++) positions[i] = Math.sin(i)
	const position = doc.createAccessor('pos').setType('VEC3').setArray(positions).setBuffer(buffer)
	const uv = doc.createAccessor('uv').setType('VEC2').setArray(fillUvs(count, sparse)).setBuffer(buffer).setSparse(sparse)
	const primitive = doc.createPrimitive().setAttribute('POSITION', position).setAttribute('TEXCOORD_0', uv)
	if (vertices) {
		const indices = new Uint16Array(triangles * 3)
		for (let i = 0; i < indices.length; i++) indices[i] = i % count
		primitive.setIndices(doc.createAccessor('idx').setType('SCALAR').setArray(indices).setBuffer(buffer))
	}
	return primitive
}

// one texture per spec, bound to base colour, emissive, normal, occlusion in that order
async function attachTextures(doc: Document, material: Material, specs: ITextureSpec[], withExif: boolean): Promise<void> {
	const slots = [
		(t: Texture) => material.setBaseColorTexture(t),
		(t: Texture) => material.setEmissiveTexture(t),
		(t: Texture) => material.setNormalTexture(t),
		(t: Texture) => material.setOcclusionTexture(t)
	]
	for (const [index, spec] of specs.entries()) {
		slots[index]?.(await imageFor(spec, doc, withExif))
		if (spec.format === 'webp') doc.createExtension(EXTTextureWebP).setRequired(false)
		if (spec.format === 'ktx2') doc.createExtension(KHRTextureBasisu).setRequired(true)
	}
}

export async function buildDocument(options: IFixtureOptions = {}): Promise<Document> {
	const { nodes = 1, textures = [], extras = false } = options
	const doc = new Document()
	doc.setLogger(new Logger(Logger.Verbosity.SILENT))
	const buffer = doc.createBuffer('buf')
	const material = doc.createMaterial('mat')
	await attachTextures(doc, material, textures, extras)
	if (options.clearcoat)
		material.setExtension(
			'KHR_materials_clearcoat',
			doc.createExtension(KHRMaterialsClearcoat).createClearcoat().setClearcoatFactor(0.5)
		)
	if (options.unusedMaterial) doc.createMaterial('unused-mat')
	const primitive = buildPrimitive(doc, buffer, options).setMaterial(material)
	const mesh = doc.createMesh('mesh').addPrimitive(primitive)
	const scene = doc.createScene('scene')
	for (let i = 0; i < nodes; i++) scene.addChild(doc.createNode(`node-${i}`).setMesh(mesh))
	if (extras) {
		const props = [
			doc.getRoot(),
			scene,
			mesh,
			primitive,
			material,
			buffer,
			...doc.getRoot().listAccessors(),
			...doc.getRoot().listNodes(),
			...doc.getRoot().listTextures()
		]
		for (const prop of props) prop.setExtras({ secret: 'extras-payload', nested: { list: [1, 2, 3] } })
	}
	return doc
}

export async function buildGlb(options: IFixtureOptions = {}): Promise<Uint8Array> {
	const doc = await buildDocument(options)
	const io = await makeIo()
	if (options.compress) await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
	return io.writeBinary(doc)
}

const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

// raw GLB from any JSON. Bad JSON on purpose possible
export function packGlb(json: unknown, bin?: Uint8Array): Uint8Array {
	const text = typeof json === 'string' ? json : JSON.stringify(json)
	return packChunks(new TextEncoder().encode(text), bin)
}

export function packChunks(jsonBytes: Uint8Array, bin?: Uint8Array): Uint8Array {
	const pad = (n: number): number => (4 - (n % 4)) % 4
	const jsonLength = jsonBytes.length + pad(jsonBytes.length)
	const binLength = bin ? bin.length + pad(bin.length) : 0
	const total = 12 + 8 + jsonLength + (bin ? 8 + binLength : 0)
	const out = new Uint8Array(total)
	const view = new DataView(out.buffer)
	view.setUint32(0, 0x46546c67, true)
	view.setUint32(4, 2, true)
	view.setUint32(8, total, true)
	view.setUint32(12, jsonLength, true)
	view.setUint32(16, CHUNK_JSON, true)
	out.fill(0x20, 20, 20 + jsonLength)
	out.set(jsonBytes, 20)
	if (bin) {
		const at = 20 + jsonLength
		view.setUint32(at, binLength, true)
		view.setUint32(at + 4, CHUNK_BIN, true)
		out.set(bin, at + 8)
	}
	return out
}

export interface IGlbParts {
	json: Record<string, any>
	bin: Uint8Array | undefined
}

export function splitGlb(glb: Uint8Array): IGlbParts {
	const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
	const jsonLength = view.getUint32(12, true)
	const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as Record<string, any>
	const binStart = 20 + jsonLength + 8
	return { json, bin: binStart < glb.length ? glb.subarray(binStart) : undefined }
}

// rewrite the JSON chunk of a real GLB, keep BIN
export function patchGlbJson(glb: Uint8Array, mutate: (json: Record<string, any>) => void): Uint8Array {
	const { json, bin } = splitGlb(glb)
	mutate(json)
	return packGlb(json, bin)
}

// bare GLB around raw image bytes, 1 image + 1 texture. Header-only bombs fit → policy stage sees them
export function glbWithImage(bytes: Uint8Array, mimeType = 'image/png'): Uint8Array {
	const padded = new Uint8Array(bytes.length + ((4 - (bytes.length % 4)) % 4))
	padded.set(bytes)
	return packGlb(
		{
			asset: { version: '2.0' },
			buffers: [{ byteLength: padded.length }],
			bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bytes.length }],
			images: [{ bufferView: 0, mimeType }],
			textures: [{ source: 0 }]
		},
		padded
	)
}
