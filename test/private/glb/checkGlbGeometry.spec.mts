import { checkGlbGeometry } from '@private/glb/checkGlbGeometry.mjs'
import { emptyStats } from '@private/glb/glbStats.mjs'
import { expect } from 'chai'

import { GLB_POLICY_DEFAULTS, type IGlbPolicy } from '../../../dist/files/GLB_POLICY_DEFAULTS.mjs'

const policy = (over: Partial<IGlbPolicy> = {}): IGlbPolicy => ({ ...GLB_POLICY_DEFAULTS, ...over })

// one mesh, one primitive over accessors [position, indices]
const scene = (primitive: object, nodes: object[] = [{ mesh: 0 }]) => ({
	accessors: [{ count: 12 }, { count: 9 }],
	meshes: [{ primitives: [{ attributes: { POSITION: 0 }, ...primitive }] }],
	nodes
})

const measure = (json: Record<string, unknown>) => {
	const stats = emptyStats(0)
	checkGlbGeometry(json, policy(), stats)
	return { triangles: stats.triangles, vertices: stats.vertices }
}

describe('private/glb/checkGlbGeometry', () => {
	it('triangles: indices / 3, mode 4 by default', () => {
		expect(measure(scene({ indices: 1 }))).to.deep.equal({ triangles: 3, vertices: 12 })
		expect(measure(scene({ indices: 1, mode: 4 }))).to.deep.equal({ triangles: 3, vertices: 12 })
	})

	it('without indices the vertex count is the element count', () => {
		expect(measure(scene({}))).to.deep.equal({ triangles: 4, vertices: 12 })
	})

	it('rounds down a partial triangle', () => {
		expect(measure({ ...scene({ indices: 0 }), accessors: [{ count: 10 }] })).to.deep.equal({ triangles: 3, vertices: 10 })
	})

	it('strip and fan: elements - 2', () => {
		expect(measure(scene({ indices: 1, mode: 5 })).triangles).to.equal(7)
		expect(measure(scene({ indices: 1, mode: 6 })).triangles).to.equal(7)
	})

	it('strip and fan never go negative', () => {
		expect(measure({ ...scene({ mode: 5 }), accessors: [{ count: 1 }] }).triangles).to.equal(0)
		expect(measure({ ...scene({ mode: 6 }), accessors: [{ count: 2 }] }).triangles).to.equal(0)
	})

	it('points, lines and unknown modes have no triangles but keep their vertices', () => {
		for (const mode of [0, 1, 2, 3, 7, 99]) {
			expect(measure(scene({ indices: 1, mode })), String(mode)).to.deep.equal({ triangles: 0, vertices: 12 })
		}
	})

	it('a mode that is not a number is treated as triangles', () => {
		expect(measure(scene({ indices: 1, mode: '5' })).triangles).to.equal(3)
	})

	it('counts the mesh once for every node that instances it', () => {
		const json = scene({ indices: 1 }, [{ mesh: 0 }, { mesh: 0 }, { mesh: 0 }])
		expect(measure(json)).to.deep.equal({ triangles: 9, vertices: 36 })
	})

	it('adds the primitives of a mesh and the meshes of the nodes', () => {
		const json = {
			accessors: [{ count: 3 }, { count: 6 }],
			meshes: [
				{ primitives: [{ attributes: { POSITION: 0 } }, { attributes: { POSITION: 1 } }] },
				{ primitives: [{ attributes: { POSITION: 0 } }] }
			],
			nodes: [{ mesh: 0 }, { mesh: 1 }]
		}
		expect(measure(json)).to.deep.equal({ triangles: 4, vertices: 12 })
	})

	it('a node without a mesh, or with a mesh that does not exist, counts nothing', () => {
		expect(measure(scene({ indices: 1 }, [{}, { mesh: 5 }, { mesh: -1 }, { mesh: 'x' }]))).to.deep.equal({
			triangles: 0,
			vertices: 0
		})
	})

	it('an accessor that does not exist, or has no valid count, counts 0', () => {
		const json = {
			accessors: [{ count: 'x' }],
			meshes: [{ primitives: [{ attributes: { POSITION: 7 } }, { attributes: { POSITION: 0 } }, {}] }],
			nodes: [{ mesh: 0 }]
		}
		expect(measure(json)).to.deep.equal({ triangles: 0, vertices: 0 })
	})

	it('survives collections and primitives that are not what they should be', () => {
		expect(
			measure({
				accessors: 'x',
				meshes: [5, { primitives: 'x' }, { primitives: [null, 4] }],
				nodes: [null, { mesh: 1 }, { mesh: 2 }]
			})
		).to.deep.equal({
			triangles: 0,
			vertices: 0
		})
		expect(measure({})).to.deep.equal({ triangles: 0, vertices: 0 })
	})

	it('a triangle count equal to maxTriangles passes, one more does not', () => {
		const json = scene({ indices: 1 })
		expect(checkGlbGeometry(json, policy({ maxTriangles: 3 }), emptyStats(0))).to.deep.equal([])
		expect(checkGlbGeometry(json, policy({ maxTriangles: 2 }), emptyStats(0))).to.deep.equal([
			{ code: 'LIMIT_EXCEEDED', limit: 'maxTriangles', message: 'the triangles: 3 is over the limit maxTriangles = 2' }
		])
	})

	it('a vertex count equal to maxVertices passes, one more does not', () => {
		const json = scene({ indices: 1 })
		expect(checkGlbGeometry(json, policy({ maxVertices: 12 }), emptyStats(0))).to.deep.equal([])
		expect(checkGlbGeometry(json, policy({ maxVertices: 11 }), emptyStats(0))).to.deep.equal([
			{ code: 'LIMIT_EXCEEDED', limit: 'maxVertices', message: 'the vertices: 12 is over the limit maxVertices = 11' }
		])
	})
})
