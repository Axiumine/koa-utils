import { LOCK_ORDER_REASONS } from '@lib/PostgreSQL/error/LOCK_ORDER_REASONS.mjs'
import { LockOrderError } from '@lib/PostgreSQL/error/LockOrderError.mjs'
import { expect } from 'chai'

describe('LockOrderError', () => {
	it('LOCK_ORDER_REASONS holds the four closed reasons, in order', () => {
		expect([...LOCK_ORDER_REASONS]).to.deep.equal(['RANK_INVERSION', 'MODE_REQUIRED', 'NOT_IN_MODE_ORDER', 'TRACKER_STARTED'])
	})

	for (const reason of LOCK_ORDER_REASONS) {
		it(`carries the reason ${reason}, the message it was given and no cause`, () => {
			const error = new LockOrderError(reason, 'text of the message')
			expect(error).to.be.instanceOf(Error)
			expect(error.name).to.equal('LockOrderError')
			expect(error.reason).to.equal(reason)
			expect(error.message).to.equal('text of the message')
			expect(error.cause).to.equal(undefined)
		})
	}
})
