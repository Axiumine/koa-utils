import type { IGlbPolicy } from '../../files/GLB_POLICY_DEFAULTS.mjs'
import type { IGlbReason, IGlbStats } from '../../files/IGlbSanitiseResult.mjs'
import { limitReasons } from './glbReason.mjs'
import { childOf, countOf, field, type IJsonObject, isObject, listOf } from './jsonAccess.mjs'

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0)

/**
 * How many objects each top-level collection holds, against its limit. Images count against `maxTextures` too, since
 * every image is a texture payload. Fills `nodes`, `meshes`, `materials`, `textures`, `animations` and `accessors` in `stats`.
 */
export function checkGlbCounts(json: IJsonObject, policy: IGlbPolicy, stats: IGlbStats): IGlbReason[] {
	const size = (key: string): number => listOf(field(json, key)).length
	stats.nodes = size('nodes')
	stats.meshes = size('meshes')
	stats.materials = size('materials')
	stats.textures = size('textures')
	stats.animations = size('animations')
	stats.accessors = size('accessors')
	return [
		...limitReasons('maxNodes', 'nodes', stats.nodes, policy.maxNodes),
		...limitReasons('maxMeshes', 'meshes', stats.meshes, policy.maxMeshes),
		...limitReasons('maxMaterials', 'materials', stats.materials, policy.maxMaterials),
		...limitReasons('maxTextures', 'textures', stats.textures, policy.maxTextures),
		...limitReasons('maxTextures', 'images', size('images'), policy.maxTextures),
		...limitReasons('maxAnimations', 'animations', stats.animations, policy.maxAnimations),
		...limitReasons('maxAccessors', 'accessors', stats.accessors, policy.maxAccessors)
	]
}

/** The biggest accessor `count`, and the sum of every `sparse.count`, against their limits. Reads the JSON only, never the data. */
export function checkGlbAccessors(json: IJsonObject, policy: IGlbPolicy): IGlbReason[] {
	const accessors = listOf(field(json, 'accessors')).filter(isObject)
	const biggest = accessors.reduce((max, accessor) => Math.max(max, countOf(field(accessor, 'count'))), 0)
	const sparse = sum(accessors.map((accessor) => countOf(field(childOf(accessor, 'sparse'), 'count'))))
	return [
		...limitReasons('maxAccessorElements', 'the biggest accessor', biggest, policy.maxAccessorElements),
		...limitReasons('maxSparseElements', 'the sparse accessors', sparse, policy.maxSparseElements)
	]
}

/** Decoded size of one `EXT_meshopt_compression` buffer view: the decoder allocates `count * byteStride` bytes. */
const meshoptBytes = (view: IJsonObject): number => {
	const meshopt = childOf(childOf(view, 'extensions'), 'EXT_meshopt_compression')
	return countOf(field(meshopt, 'count')) * countOf(field(meshopt, 'byteStride'))
}

/**
 * The declared size of every buffer plus the decoded size of every meshopt buffer view, against `maxBufferBytes`. The
 * decoder allocates `count * byteStride` before it reads one byte, so a tiny file can ask for gigabytes.
 */
export function checkGlbBuffers(json: IJsonObject, policy: IGlbPolicy, stats: IGlbStats): IGlbReason[] {
	const declared = sum(
		listOf(field(json, 'buffers'))
			.filter(isObject)
			.map((buffer) => countOf(field(buffer, 'byteLength')))
	)
	const decoded = sum(listOf(field(json, 'bufferViews')).filter(isObject).map(meshoptBytes))
	stats.bufferBytes = declared + decoded
	return limitReasons('maxBufferBytes', 'the buffers', stats.bufferBytes, policy.maxBufferBytes)
}
