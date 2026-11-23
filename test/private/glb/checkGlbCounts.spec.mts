import { checkGlbAccessors, checkGlbBuffers, checkGlbCounts } from '@private/glb/checkGlbCounts.mjs'
import { emptyStats } from '@private/glb/glbStats.mjs'
import { expect } from 'chai'

import { GLB_POLICY_DEFAULTS, type IGlbPolicy } from '../../../dist/files/GLB_POLICY_DEFAULTS.mjs'

const policy = (over: Partial<IGlbPolicy>): IGlbPolicy => ({ ...GLB_POLICY_DEFAULTS, ...over })
const items = (n: number): object[] => Array.from({ length: n }, () => ({}))

describe('private/glb/checkGlbCounts', () => {
	const rows = [
		['nodes', 'maxNodes'],
		['meshes', 'maxMeshes'],
		['materials', 'maxMaterials'],
		['textures', 'maxTextures'],
		['animations', 'maxAnimations'],
		['accessors', 'maxAccessors']
	] as const

	for (const [key, limit] of rows) {
		it(`${key}: a count equal to ${limit} passes, one more is LIMIT_EXCEEDED`, () => {
			expect(checkGlbCounts({ [key]: items(3) }, policy({ [limit]: 3 }), emptyStats(0))).to.deep.equal([])
			const reasons = checkGlbCounts({ [key]: items(4) }, policy({ [limit]: 3 }), emptyStats(0))
			expect(reasons).to.deep.equal([{ code: 'LIMIT_EXCEEDED', limit, message: `${key}: 4 is over the limit ${limit} = 3` }])
		})

		it(`${key}: fills stats.${key} and nothing else`, () => {
			const stats = emptyStats(9)
			checkGlbCounts({ [key]: items(4) }, policy({}), stats)
			expect(stats).to.deep.equal({ ...emptyStats(9), [key]: 4 })
		})
	}

	it('images count against maxTextures too, and leave the stats alone', () => {
		const stats = emptyStats(0)
		const reasons = checkGlbCounts({ images: items(3) }, policy({ maxTextures: 2 }), stats)
		expect(reasons).to.deep.equal([
			{ code: 'LIMIT_EXCEEDED', limit: 'maxTextures', message: 'images: 3 is over the limit maxTextures = 2' }
		])
		expect(stats.textures).to.equal(0)
		expect(checkGlbCounts({ images: items(2) }, policy({ maxTextures: 2 }), emptyStats(0))).to.deep.equal([])
	})

	it('counts nothing for a collection that is not an array', () => {
		const stats = emptyStats(0)
		expect(checkGlbCounts({ nodes: 'x', meshes: { length: 9 } }, policy({ maxNodes: 1, maxMeshes: 1 }), stats)).to.deep.equal([])
		expect(stats.nodes).to.equal(0)
	})
})

describe('private/glb/checkGlbAccessors', () => {
	it('checks the biggest single count, not the sum', () => {
		const json = { accessors: [{ count: 5 }, { count: 7 }, { count: 6 }] }
		expect(checkGlbAccessors(json, policy({ maxAccessorElements: 7 }))).to.deep.equal([])
		expect(checkGlbAccessors(json, policy({ maxAccessorElements: 6 }))).to.deep.equal([
			{
				code: 'LIMIT_EXCEEDED',
				limit: 'maxAccessorElements',
				message: 'the biggest accessor: 7 is over the limit maxAccessorElements = 6'
			}
		])
	})

	it('checks the sum of the sparse counts, not the biggest', () => {
		const json = { accessors: [{ count: 9, sparse: { count: 3 } }, { count: 9, sparse: { count: 4 } }, { count: 9 }] }
		expect(checkGlbAccessors(json, policy({ maxSparseElements: 7 }))).to.deep.equal([])
		expect(checkGlbAccessors(json, policy({ maxSparseElements: 6 }))).to.deep.equal([
			{
				code: 'LIMIT_EXCEEDED',
				limit: 'maxSparseElements',
				message: 'the sparse accessors: 7 is over the limit maxSparseElements = 6'
			}
		])
	})

	it('a sparse accessor with a huge count and one sparse element hits the accessor limit', () => {
		const json = { accessors: [{ count: 2_000_000_000, sparse: { count: 1 } }] }
		expect(checkGlbAccessors(json, policy({})).map((reason) => reason.limit)).to.deep.equal(['maxAccessorElements'])
	})

	it('ignores accessors that are not objects and counts that are not integers', () => {
		const json = { accessors: [5, null, { count: 'many', sparse: 'x' }, { count: -4, sparse: { count: 1.5 } }] }
		expect(checkGlbAccessors(json, policy({ maxAccessorElements: 1, maxSparseElements: 1 }))).to.deep.equal([])
	})
})

describe('private/glb/checkGlbBuffers', () => {
	it('adds the declared byte length of every buffer', () => {
		const stats = emptyStats(0)
		const json = { buffers: [{ byteLength: 100 }, { byteLength: 50 }] }
		expect(checkGlbBuffers(json, policy({ maxBufferBytes: 150 }), stats)).to.deep.equal([])
		expect(stats.bufferBytes).to.equal(150)
		expect(checkGlbBuffers(json, policy({ maxBufferBytes: 149 }), emptyStats(0))).to.deep.equal([
			{ code: 'LIMIT_EXCEEDED', limit: 'maxBufferBytes', message: 'the buffers: 150 is over the limit maxBufferBytes = 149' }
		])
	})

	it('adds count * byteStride of every meshopt buffer view: the decoder allocates it up front', () => {
		const stats = emptyStats(0)
		const json = {
			buffers: [{ byteLength: 10 }],
			bufferViews: [
				{ extensions: { EXT_meshopt_compression: { count: 10, byteStride: 4 } } },
				{ extensions: { EXT_meshopt_compression: { count: 3, byteStride: 2 } } },
				{ byteLength: 999 }
			]
		}
		expect(checkGlbBuffers(json, policy({ maxBufferBytes: 56 }), stats)).to.deep.equal([])
		expect(stats.bufferBytes).to.equal(56)
		expect(checkGlbBuffers(json, policy({ maxBufferBytes: 55 }), emptyStats(0))).to.have.length(1)
	})

	it('a tiny file that asks the decoder for gigabytes is over the limit', () => {
		const json = {
			buffers: [{ byteLength: 10 }],
			bufferViews: [{ extensions: { EXT_meshopt_compression: { count: 2 ** 31, byteStride: 64 } } }]
		}
		expect(checkGlbBuffers(json, policy({}), emptyStats(0)).map((reason) => reason.limit)).to.deep.equal(['maxBufferBytes'])
	})

	it('ignores buffers and views that are not objects, and meshopt data that is not an object', () => {
		const stats = emptyStats(0)
		const json = {
			buffers: ['x', null, { byteLength: 'big' }],
			bufferViews: [1, { extensions: 'x' }, { extensions: { EXT_meshopt_compression: 5 } }]
		}
		expect(checkGlbBuffers(json, policy({ maxBufferBytes: 1 }), stats)).to.deep.equal([])
		expect(stats.bufferBytes).to.equal(0)
	})
})
