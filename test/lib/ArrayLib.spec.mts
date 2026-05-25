import { ArrayLib } from '@lib/ArrayLib.mjs'
import { expect } from 'chai'

describe('ArrayLib', () => {
	// instantiate via `new` to cover the constructor body line
	it('can be instantiated with new', () => {
		const instance = new ArrayLib()
		expect(instance).to.be.instanceOf(ArrayLib)
	})

	const arr = new ArrayLib()

	describe('arrDiff', () => {
		it('returns elements in larger array not in smaller', () => {
			expect(arr.arrDiff(['a'], ['a', 'b', 'c']).sort()).to.deep.equal(['b', 'c'])
		})

		it('handles reversed argument order (sorts by length)', () => {
			expect(arr.arrDiff(['a', 'b', 'c'], ['a']).sort()).to.deep.equal(['b', 'c'])
		})

		it('returns empty when arrays equal', () => {
			expect(arr.arrDiff(['x', 'y'], ['x', 'y'])).to.deep.equal([])
		})

		it('returns empty when larger contains all of smaller and nothing else', () => {
			expect(arr.arrDiff([], [])).to.deep.equal([])
		})

		it('returns whole larger when smaller is empty', () => {
			expect(arr.arrDiff([], ['a', 'b']).sort()).to.deep.equal(['a', 'b'])
		})

		it('does not dedupe larger array', () => {
			expect(arr.arrDiff(['a'], ['b', 'b', 'c']).sort()).to.deep.equal(['b', 'b', 'c'])
		})
	})
})
