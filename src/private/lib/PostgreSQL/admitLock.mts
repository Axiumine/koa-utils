import { LockOrderError } from '@lib/PostgreSQL/error/LockOrderError.mjs'
import type { ILockAdmission } from '@lib/PostgreSQL/lock/ILockAdmission.mjs'

import type { IHelperRank } from './IHelperRank.mjs'
import type { ILockOrderPlan } from './ILockOrderPlan.mjs'
import type { ITrackerState } from './ITrackerState.mjs'

/** The error for a helper that has no rank in the mode of the transaction. */
function modeMistake(plan: ILockOrderPlan, state: ITrackerState, helper: string): LockOrderError {
	if (state.order === plan.defaultOrder) {
		const homes = [...plan.orders.values()].filter((order) => order.ranks.has(helper)).map((order) => order.mode)
		return new LockOrderError(
			'MODE_REQUIRED',
			`${helper} belongs to the ${homes.join(' or ')} order: set that mode on the transaction before its first lock`
		)
	}
	return new LockOrderError(
		'NOT_IN_MODE_ORDER',
		`${helper} is not one of the locks of the ${state.order.mode} order (${state.order.names.join(', ')})`
	)
}

/** The error for a rank lower than one already recorded; it names both ranks. */
function rankInversion(state: ITrackerState, helper: string, taken: IHelperRank): LockOrderError {
	return new LockOrderError(
		'RANK_INVERSION',
		`lock order violated: ${helper} takes rank ${String(taken.rank)} (${taken.name}) after rank ${String(state.rank)} (${String(state.order.names[state.rank - 1])}) in the ${state.order.mode} order`
	)
}

/**
 * Checks the request of a helper against the order of the mode of the transaction, and answers the rank to record, or
 * nothing when the helper has no rank in this mode and the check is off. Nothing is recorded here. The same rank again
 * passes; a lower one is `RANK_INVERSION`; a helper outside the mode is `MODE_REQUIRED` (the transaction is in the default
 * mode) or `NOT_IN_MODE_ORDER`. With the check off none of them throws. A `TypeError` for a helper the spec does not name.
 */
export function admitLock(plan: ILockOrderPlan, state: ITrackerState, helper: string): ILockAdmission | undefined {
	if (!plan.helpers.has(helper)) throw new TypeError('helper is not named in the lock order spec')
	const taken = state.order.ranks.get(helper)
	if (taken === undefined) {
		if (state.rankCheck) throw modeMistake(plan, state, helper)
		return undefined
	}
	if (state.rankCheck && taken.rank < state.rank) throw rankInversion(state, helper, taken)
	return { rank: taken.rank }
}
