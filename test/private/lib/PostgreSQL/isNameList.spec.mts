import { isNameList } from '@private/lib/PostgreSQL/isNameList.mjs'
import { expect } from 'chai'

describe('isNameList', () => {
	it('is true for a list of plain identifiers, and for the empty list', () => {
		expect(isNameList(['a', 'b_1', 'r$'])).to.equal(true)
		expect(isNameList([])).to.equal(true)
	})

	it('is false when any entry is not a plain identifier', () => {
		expect(isNameList(['a', 'b c'])).to.equal(false)
		expect(isNameList(['a.b'])).to.equal(false)
		expect(isNameList([''])).to.equal(false)
		expect(isNameList(['ok', 5])).to.equal(false)
		expect(isNameList([null])).to.equal(false)
		expect(isNameList([['a']])).to.equal(false)
	})

	it('is false for anything that is not an array', () => {
		for (const value of ['a', undefined, null, 5, { length: 1, 0: 'a' }, new Set(['a'])])
			expect(isNameList(value)).to.equal(false)
	})
})
