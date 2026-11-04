import { DB_NOW_SQL } from '@lib/PostgreSQL/clock/DB_NOW_SQL.mjs'
import { expect } from 'chai'

describe('DB_NOW_SQL', () => {
	it('is the wall clock of the database server, not the start of the transaction', () => {
		expect(DB_NOW_SQL).to.equal('clock_timestamp()')
		expect(DB_NOW_SQL).to.not.match(/now\(\)|transaction_timestamp/)
	})
})
