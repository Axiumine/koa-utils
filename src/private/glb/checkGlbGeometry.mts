import type { IGlbPolicy } from '../../files/GLB_POLICY_DEFAULTS.mjs'
import type { IGlbReason, IGlbStats } from '../../files/IGlbSanitiseResult.mjs'
import { limitReasons } from './glbReason.mjs'
import { childOf, countOf, field, type IJsonObject, isObject, itemOf, listOf } from './jsonAccess.mjs'

interface ICounts {
	triangles: number
	vertices: number
}

const MODE_TRIANGLES = 4
const MODE_STRIP = 5
const MODE_FAN = 6

function trianglesOf(mode: unknown, elements: number): number {
	const value = typeof mode === 'number' ? mode : MODE_TRIANGLES
	if (value === MODE_TRIANGLES) {
		return Math.floor(elements / 3)
	}
	return value === MODE_STRIP || value === MODE_FAN ? Math.max(0, elements - 2) : 0
}

function primitiveCounts(primitive: IJsonObject, accessors: unknown[]): ICounts {
	const vertices = countOf(field(itemOf(accessors, field(childOf(primitive, 'attributes'), 'POSITION')), 'count'))
	const indices = field(primitive, 'indices')
	const elements = indices === undefined ? vertices : countOf(field(itemOf(accessors, indices), 'count'))
	return { triangles: trianglesOf(field(primitive, 'mode'), elements), vertices }
}

function meshCounts(mesh: IJsonObject, accessors: unknown[]): ICounts {
	const counts: ICounts = { triangles: 0, vertices: 0 }
	for (const primitive of listOf(field(mesh, 'primitives')).filter(isObject)) {
		const one = primitiveCounts(primitive, accessors)
		counts.triangles += one.triangles
		counts.vertices += one.vertices
	}
	return counts
}

/**
 * Triangles and vertices of the scene, read from the accessor `count` fields and never from the data. A mesh is counted
 * once for every node that instances it, because that is what the renderer draws, and 10 000 nodes on one big mesh is a
 * bomb. Fills `stats.triangles` and `stats.vertices`.
 */
export function checkGlbGeometry(json: IJsonObject, policy: IGlbPolicy, stats: IGlbStats): IGlbReason[] {
	const accessors = listOf(field(json, 'accessors'))
	const meshes = listOf(field(json, 'meshes'))
	const perMesh = new Map<unknown, ICounts>()
	let triangles = 0
	let vertices = 0
	for (const node of listOf(field(json, 'nodes')).filter(isObject)) {
		const mesh = field(node, 'mesh')
		let counts = perMesh.get(mesh)
		if (!counts) {
			counts = meshCounts(itemOf(meshes, mesh), accessors)
			perMesh.set(mesh, counts)
		}
		triangles += counts.triangles
		vertices += counts.vertices
	}
	stats.triangles = triangles
	stats.vertices = vertices
	return [
		...limitReasons('maxTriangles', 'the triangles', triangles, policy.maxTriangles),
		...limitReasons('maxVertices', 'the vertices', vertices, policy.maxVertices)
	]
}
