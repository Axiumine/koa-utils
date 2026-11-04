import { LockOrderError } from '@lib/PostgreSQL/error/LockOrderError.mjs'
import type { ITrackerState } from '@private/lib/PostgreSQL/ITrackerState.mjs'
import { admitLock } from '@private/lib/PostgreSQL/admitLock.mjs'
import { lockOrderPlan } from '@private/lib/PostgreSQL/lockOrderPlan.mjs'
import { expect } from 'chai'

import { thrownBy } from '../../../helpers/recordingTx.mjs'
import { TOY_SPEC } from '../../../helpers/toyLockSpec.mjs'

const plan = lockOrderPlan(TOY_SPEC)

// 3rd mode w/ helper in two non-default modes → MODE_REQUIRED lists both
const wide = lockOrderPlan({
	orders: { standard: ['a'], teardown: ['b'], audit: ['c'] },
	helpers: { takeA: { standard: 'a' }, takeBC: { teardown: 'b', audit: 'c' } },
	defaultMode: 'standard'
})

function stateIn(mode: string, rank = 0, rankCheck = true, on = plan): ITrackerState {
	const order = on.orders.get(mode)
	if (order === undefined) throw new Error('no such mode in the plan')
	return { order, rankCheck, rank, held: new Map() }
}

function lockError(call: () => unknown): LockOrderError {
	const error = thrownBy(call)
	expect(error).to.be.instanceOf(LockOrderError)
	return error as LockOrderError
}

describe('admitLock: a rank in order', () => {
	it('answers the rank of the helper in the mode of the transaction, and records nothing', () => {
		const state = stateIn('standard')
		expect(admitLock(plan, state, 'takeDelta')).to.deep.equal({ rank: 4 })
		expect(admitLock(plan, stateIn('teardown'), 'takeOmega')).to.deep.equal({ rank: 3 })
		expect(state.rank).to.equal(0)
		expect(state.held.size).to.equal(0)
	})

	it('passes the same rank again and a higher one', () => {
		expect(admitLock(plan, stateIn('standard', 4), 'takeDelta')).to.deep.equal({ rank: 4 })
		expect(admitLock(plan, stateIn('standard', 4), 'takeZeta')).to.deep.equal({ rank: 6 })
	})
})

describe('admitLock: a rank out of order', () => {
	it('throws RANK_INVERSION that names the helper, both ranks and the order', () => {
		const error = lockError(() => admitLock(plan, stateIn('standard', 4), 'takeBeta'))
		expect(error.reason).to.equal('RANK_INVERSION')
		expect(error.message).to.equal(
			'lock order violated: takeBeta takes rank 2 (beta) after rank 4 (delta) in the standard order'
		)
	})

	it('reads the names from the order of the mode it is in', () => {
		const error = lockError(() => admitLock(plan, stateIn('teardown', 3), 'takeBeta'))
		expect(error.message).to.equal(
			'lock order violated: takeBeta takes rank 1 (beta) after rank 3 (omega) in the teardown order'
		)
	})

	it('lets an inversion through, and answers the rank, when the check is off', () => {
		expect(admitLock(plan, stateIn('standard', 4, false), 'takeBeta')).to.deep.equal({ rank: 2 })
	})
})

describe('admitLock: a helper outside the mode', () => {
	it('throws MODE_REQUIRED in the default mode, naming the mode the helper belongs to', () => {
		const error = lockError(() => admitLock(plan, stateIn('standard'), 'takeOmega'))
		expect(error.reason).to.equal('MODE_REQUIRED')
		expect(error.message).to.equal(
			'takeOmega belongs to the teardown order: set that mode on the transaction before its first lock'
		)
	})

	it('names every other mode that holds the helper', () => {
		const error = lockError(() => admitLock(wide, stateIn('standard', 0, true, wide), 'takeBC'))
		expect(error.message).to.equal(
			'takeBC belongs to the teardown or audit order: set that mode on the transaction before its first lock'
		)
	})

	it('throws NOT_IN_MODE_ORDER in another mode, listing the locks of that order', () => {
		const error = lockError(() => admitLock(plan, stateIn('teardown'), 'takeDelta'))
		expect(error.reason).to.equal('NOT_IN_MODE_ORDER')
		expect(error.message).to.equal('takeDelta is not one of the locks of the teardown order (beta, gamma, omega)')
		expect(lockError(() => admitLock(wide, stateIn('audit', 0, true, wide), 'takeA')).reason).to.equal('NOT_IN_MODE_ORDER')
	})

	it('answers nothing, and throws nothing, when the check is off', () => {
		expect(admitLock(plan, stateIn('standard', 0, false), 'takeOmega')).to.equal(undefined)
		expect(admitLock(plan, stateIn('teardown', 0, false), 'takeDelta')).to.equal(undefined)
	})
})

describe('admitLock: a helper the spec does not name', () => {
	it('is a TypeError, also when the check is off, and for names every object has', () => {
		for (const helper of ['takeNothing', '__proto__', 'toString', 'constructor', 'hasOwnProperty', '']) {
			for (const rankCheck of [true, false]) {
				const error = thrownBy(() => admitLock(plan, stateIn('standard', 0, rankCheck), helper))
				expect(error).to.be.instanceOf(TypeError)
				expect(error).to.have.property('message', 'helper is not named in the lock order spec')
			}
		}
	})
})
