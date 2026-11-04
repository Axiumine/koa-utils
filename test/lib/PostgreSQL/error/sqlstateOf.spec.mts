import { sqlstateOf } from '@lib/PostgreSQL/error/sqlstateOf.mjs'
import { expect } from 'chai'
import { inspect } from 'node:util'

describe('sqlstateOf', () => {
	it('answers a five-character code of digits and upper-case letters', () => {
		expect(sqlstateOf({ code: '23505' })).to.equal('23505')
		expect(sqlstateOf({ code: '40P01' })).to.equal('40P01')
		expect(sqlstateOf(Object.assign(new Error('x'), { code: '55P03' }))).to.equal('55P03')
	})

	it('answers undefined for anything else', () => {
		const refused: unknown[] = [
			undefined,
			null,
			'text',
			42,
			{},
			{ code: 23505 },
			{ code: '2350' },
			{ code: '235050' },
			{ code: '23 05' },
			{ code: '2350a' },
			{ code: 'a'.repeat(300) },
			// anchors: valid code inside longer text still refused
			{ code: 'x23505' },
			{ code: '23505x' },
			{ code: '23505\n' }
		]
		for (const value of refused) expect(sqlstateOf(value), inspect(value)).to.equal(undefined)
	})
})
