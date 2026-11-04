import { CLOCK_SQL } from '@lib/PostgreSQL/clock/CLOCK_SQL.mjs'
import { DbClockError } from '@lib/PostgreSQL/error/DbClockError.mjs'
import { clockStatement } from '@private/lib/PostgreSQL/clockStatement.mjs'
import { expect } from 'chai'

import { thrownBy } from '../../../helpers/recordingTx.mjs'

describe('clockStatement', () => {
	it('is CLOCK_SQL without a seam', () => {
		expect(clockStatement(undefined)).to.equal(CLOCK_SQL)
	})

	it('is the statement of an allowed seam, as given', () => {
		expect(clockStatement({ statement: 'SELECT 1::bigint AS ms', allowed: true })).to.equal('SELECT 1::bigint AS ms')
	})

	it('refuses a seam that is not allowed: SEAM_REFUSED', () => {
		const error = thrownBy(() => clockStatement({ statement: 'SELECT 1::bigint AS ms', allowed: false }))
		expect(error).to.be.instanceOf(DbClockError)
		expect(error).to.deep.include({ reason: 'SEAM_REFUSED' })
	})

	it('checks object, statement, allowed, then allowed = true, in that order', () => {
		expect(thrownBy(() => clockStatement(null)))
			.to.be.instanceOf(TypeError)
			.and.have.property('message', 'seam must be an object')
		expect(thrownBy(() => clockStatement(1))).to.have.property('message', 'seam must be an object')
		const bad = { statement: 7, allowed: 'no' }
		expect(thrownBy(() => clockStatement(bad))).to.have.property('message', 'seam.statement must be a non-empty string')
		expect(thrownBy(() => clockStatement({ statement: '', allowed: 'no' }))).to.have.property(
			'message',
			'seam.statement must be a non-empty string'
		)
		expect(thrownBy(() => clockStatement({ statement: 'S', allowed: 'no' }))).to.have.property(
			'message',
			'seam.allowed must be a boolean'
		)
		expect(thrownBy(() => clockStatement({ statement: 'S', allowed: false }))).to.be.instanceOf(DbClockError)
	})
})
