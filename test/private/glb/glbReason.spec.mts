import { limitReasons, MAX_REASONS, tooLargeReason } from '@private/glb/glbReason.mjs'
import { emptyStats, rejected } from '@private/glb/glbStats.mjs'
import { expect } from 'chai'

describe('private/glb/glbReason + glbStats', () => {
	it('limitReasons passes a value equal to the limit and rejects one over it', () => {
		expect(limitReasons('maxNodes', 'nodes', 5, 5)).to.deep.equal([])
		expect(limitReasons('maxNodes', 'nodes', 4, 5)).to.deep.equal([])
		expect(limitReasons('maxNodes', 'nodes', 6, 5)).to.deep.equal([
			{ code: 'LIMIT_EXCEEDED', limit: 'maxNodes', message: 'nodes: 6 is over the limit maxNodes = 5' }
		])
	})

	it('tooLargeReason names the size and the limit', () => {
		expect(tooLargeReason(10, 4)).to.deep.equal({ code: 'GLB_TOO_LARGE', message: 'the file has 10 bytes, the limit is 4' })
	})

	it('MAX_REASONS is 20', () => {
		expect(MAX_REASONS).to.equal(20)
	})

	it('emptyStats is all zero except the input size', () => {
		expect(emptyStats(42)).to.deep.equal({
			inputBytes: 42,
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

	it('rejected keeps the stats and cuts the reasons to MAX_REASONS', () => {
		const stats = emptyStats(1)
		const reasons = Array.from({ length: MAX_REASONS + 5 }, (_, index) => tooLargeReason(index, 0))
		const result = rejected(reasons, stats)
		expect(result.accepted).to.equal(false)
		expect(result.stats).to.equal(stats)
		expect(result.reasons).to.have.length(MAX_REASONS)
		expect(result.reasons[0]).to.equal(reasons[0])
		expect(rejected(reasons.slice(0, 2), stats).reasons).to.have.length(2)
	})
})
