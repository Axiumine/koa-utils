import { DB_CLOCK_REASONS } from '@lib/PostgreSQL/error/DB_CLOCK_REASONS.mjs'
import { DbClockError } from '@lib/PostgreSQL/error/DbClockError.mjs'
import type { IDbClockReason } from '@lib/PostgreSQL/error/IDbClockReason.mjs'
import { expect } from 'chai'

// message per reason, exact. Message fixed → holds no value
const MESSAGES: Record<IDbClockReason, string> = {
	WRITE_BEFORE_LOCK: 'the clock of a write transaction is read after the first lock helper has returned, not before',
	NOT_READ: 'the instant of this transaction was not read yet: await clock.read() once before now()',
	ALREADY_BOUND: 'this transaction already has a clock',
	SEAM_REFUSED: 'the test seam of the clock is not allowed here',
	BAD_RESULT: 'the clock statement did not answer one int8 value',
	UNSAFE_INSTANT: 'the database instant is not a safe integer number of milliseconds'
}

describe('DbClockError', () => {
	it('DB_CLOCK_REASONS holds the six closed reasons, in order', () => {
		expect([...DB_CLOCK_REASONS]).to.deep.equal([
			'WRITE_BEFORE_LOCK',
			'NOT_READ',
			'ALREADY_BOUND',
			'SEAM_REFUSED',
			'BAD_RESULT',
			'UNSAFE_INSTANT'
		])
	})

	for (const reason of DB_CLOCK_REASONS) {
		it(`carries the reason ${reason}, its fixed message and no cause`, () => {
			const error = new DbClockError(reason)
			expect(error).to.be.instanceOf(Error)
			expect(error.name).to.equal('DbClockError')
			expect(error.reason).to.equal(reason)
			expect(error.message).to.equal(MESSAGES[reason])
			expect(error.cause).to.equal(undefined)
			expect(Object.keys(error).sort()).to.deep.equal(['name', 'reason'])
		})
	}

	it('has a different message for each reason, and none holds a number', () => {
		const messages = new Set(DB_CLOCK_REASONS.map((reason) => new DbClockError(reason).message))
		expect(messages.size).to.equal(DB_CLOCK_REASONS.length)
		for (const message of messages) expect(message).to.not.match(/\d{6}/)
	})

	it('names no environment variable and no schema', () => {
		for (const reason of DB_CLOCK_REASONS) expect(new DbClockError(reason).message).to.not.match(/_ENV|schema/i)
	})
})
