import { isOneOf } from '@private/lib/PostgreSQL/isOneOf.mjs'
import { expect } from 'chai'

describe('isOneOf', () => {
	const list = ['SELECT', 'INSERT']

	it('is true for a listed string', () => {
		expect(isOneOf(list, 'SELECT')).to.equal(true)
		expect(isOneOf(list, 'INSERT')).to.equal(true)
	})

	it('is false for a string that is not listed, and case counts', () => {
		expect(isOneOf(list, 'DELETE')).to.equal(false)
		expect(isOneOf(list, 'select')).to.equal(false)
		expect(isOneOf(list, 'SELECT ')).to.equal(false)
		expect(isOneOf(list, '')).to.equal(false)
	})

	it('is false for a value that is not a string, even one that prints like a listed word', () => {
		const printsLikeListed = { toString: () => 'SELECT' }
		for (const value of [undefined, null, 1, ['SELECT'], printsLikeListed]) expect(isOneOf(list, value)).to.equal(false)
	})

	it('is false for every value of an empty list', () => {
		expect(isOneOf([], 'SELECT')).to.equal(false)
	})
})
