import { buildConstraintEntry } from '@lib/PostgreSQL/error/buildConstraintEntry.mjs'
import { lookupConstraint } from '@lib/PostgreSQL/error/lookupConstraint.mjs'
import { expect } from 'chai'

describe('lookupConstraint', () => {
	// 2 rows → lookup of the 2nd proves the search is by name, not "first row"
	const table = Object.freeze({
		a_uq: buildConstraintEntry('EMAIL_TAKEN'),
		b_uq: buildConstraintEntry('INVALID', { fixed: { field: 'id' } })
	})

	it('finds an own key, the first and the others', () => {
		expect(lookupConstraint(table, 'a_uq')).to.deep.equal({ code: 'EMAIL_TAKEN' })
		expect(lookupConstraint(table, 'b_uq')).to.deep.equal({ code: 'INVALID', fixed: { field: 'id' } })
	})

	it('answers the row itself, not a copy', () => {
		expect(lookupConstraint(table, 'a_uq')).to.equal(table.a_uq)
	})

	it('finds nothing for a name that is not in the table, or that is a property of every object', () => {
		for (const name of ['missing', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', '']) {
			expect(lookupConstraint(table, name), name).to.equal(undefined)
		}
	})

	it('finds nothing in an empty table', () => {
		expect(lookupConstraint({}, 'a_uq')).to.equal(undefined)
	})

	it('finds an own key named like a property of every object', () => {
		// computed key => own data property. `__proto__` literal would set prototype instead
		const odd = { ['__proto__']: buildConstraintEntry('ODD') }
		expect(lookupConstraint(odd, '__proto__')).to.deep.equal({ code: 'ODD' })
	})
})
