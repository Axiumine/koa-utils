import { catalogFlag } from '@private/lib/PostgreSQL/catalogFlag.mjs'
import { expect } from 'chai'

describe('catalogFlag', () => {
	it('answers a boolean as it is', () => {
		expect(catalogFlag(true)).to.equal(true)
		expect(catalogFlag(false)).to.equal(false)
	})

	it('throws a TypeError for anything that is not a boolean, even a value that reads as one', () => {
		for (const value of [undefined, null, 0, 1, 't', 'f', 'false', 'true', '', {}, []]) {
			expect(() => catalogFlag(value), JSON.stringify(value)).to.throw(TypeError, 'the catalog answered a value of another type')
		}
	})
})
