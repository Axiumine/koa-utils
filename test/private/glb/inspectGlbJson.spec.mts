import { emptyStats } from '@private/glb/glbStats.mjs'
import { inspectGlbJson } from '@private/glb/inspectGlbJson.mjs'
import { expect } from 'chai'

import { GLB_POLICY_DEFAULTS } from '../../../dist/files/GLB_POLICY_DEFAULTS.mjs'
import { makeImage } from '../../helpers/glbFixtures.mjs'

describe('private/glb/inspectGlbJson', () => {
	it('a clean file gives no reasons and fills the stats of every stage', async () => {
		const png = await makeImage('png', 8, 6)
		const json = {
			accessors: [{ count: 3 }],
			buffers: [{ byteLength: png.length }],
			bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: png.length }],
			images: [{ bufferView: 0, mimeType: 'image/png' }],
			textures: [{ source: 0 }],
			meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
			nodes: [{ mesh: 0 }]
		}
		const stats = emptyStats(0)
		expect(inspectGlbJson(json, png, GLB_POLICY_DEFAULTS, stats)).to.deep.equal([])
		expect(stats).to.deep.equal({
			...emptyStats(0),
			nodes: 1,
			meshes: 1,
			textures: 1,
			accessors: 1,
			triangles: 1,
			vertices: 3,
			bufferBytes: png.length,
			maxTextureSide: 8
		})
	})

	it('reports the findings of every stage together, in a fixed order', () => {
		const json = {
			buffers: [{ byteLength: 1, uri: 'https://evil.example/a.bin' }],
			extensionsUsed: ['KHR_interactivity'],
			nodes: [{}, {}],
			accessors: [{ count: 9, sparse: { count: 9 } }],
			images: [{}]
		}
		const policy = { ...GLB_POLICY_DEFAULTS, maxNodes: 1, maxAccessorElements: 5, maxSparseElements: 5 }
		const codes = inspectGlbJson(json, null, policy, emptyStats(0)).map((reason) => reason.code)
		expect(codes).to.deep.equal([
			'URI_EXTERNAL',
			'EXTENSION_FORBIDDEN',
			'LIMIT_EXCEEDED',
			'LIMIT_EXCEEDED',
			'LIMIT_EXCEEDED',
			'IMAGE_UNREADABLE'
		])
	})

	it('each limit family shows up with its own limit name', () => {
		const json = {
			buffers: [{ byteLength: 100 }],
			accessors: [{ count: 30 }, { count: 2, sparse: { count: 2 } }],
			meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
			nodes: [{ mesh: 0 }]
		}
		const policy = {
			...GLB_POLICY_DEFAULTS,
			maxAccessors: 1,
			maxBufferBytes: 99,
			maxAccessorElements: 29,
			maxSparseElements: 1,
			maxTriangles: 9,
			maxVertices: 29
		}
		const limits = inspectGlbJson(json, null, policy, emptyStats(0)).map((reason) => reason.limit)
		expect(limits).to.deep.equal([
			'maxAccessors',
			'maxAccessorElements',
			'maxSparseElements',
			'maxBufferBytes',
			'maxTriangles',
			'maxVertices'
		])
	})
})
