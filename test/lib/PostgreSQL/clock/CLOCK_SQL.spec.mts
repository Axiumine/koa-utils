import { CLOCK_SQL } from '@lib/PostgreSQL/clock/CLOCK_SQL.mjs'
import { DB_NOW_SQL } from '@lib/PostgreSQL/clock/DB_NOW_SQL.mjs'
import { expect } from 'chai'

describe('CLOCK_SQL', () => {
	it('reads clock_timestamp() as epoch milliseconds cut toward zero, as a bigint named ms', () => {
		expect(CLOCK_SQL).to.equal('SELECT trunc(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS ms')
	})

	it('holds the database time expression, and that expression is the wall clock', () => {
		expect(CLOCK_SQL).to.contain(DB_NOW_SQL)
		expect(DB_NOW_SQL).to.equal('clock_timestamp()')
	})

	it('takes no parameter, so no time is bound from the process', () => {
		expect(CLOCK_SQL).to.not.contain('$')
	})

	it('names no schema: one statement text, nothing but the built-in functions', () => {
		expect(CLOCK_SQL).to.not.match(/test|\./i)
	})
})
