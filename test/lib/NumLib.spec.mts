import { expect } from 'chai'

import { NumLib } from '@lib/NumLib.mjs'

describe('NumLib', () => {
	it('can be instantiated with new', () => {
		const instance = new NumLib()
		expect(instance).to.be.instanceOf(NumLib)
	})

	describe('parseFloatFixed', () => {
		it('parses dot-separated decimals', () => {
			expect(NumLib.parseFloatFixed('1.5')).to.equal(1.5)
		})

		it('replaces commas with dots before parsing', () => {
			expect(NumLib.parseFloatFixed('1,5')).to.equal(1.5)
		})

		it('returns NaN on garbage input', () => {
			expect(Number.isNaN(NumLib.parseFloatFixed('abc'))).to.equal(true)
		})

		it('parses negative values', () => {
			expect(NumLib.parseFloatFixed('-3,14')).to.equal(-3.14)
		})

		it('parses integer-looking strings', () => {
			expect(NumLib.parseFloatFixed('42')).to.equal(42)
		})
	})
})
