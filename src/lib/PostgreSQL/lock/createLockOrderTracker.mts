import { LockOrderError } from '@lib/PostgreSQL/error/LockOrderError.mjs'
import { admitLock } from '@private/lib/PostgreSQL/admitLock.mjs'
import type { ITrackerState } from '@private/lib/PostgreSQL/ITrackerState.mjs'
import { lockOrderPlan } from '@private/lib/PostgreSQL/lockOrderPlan.mjs'
import { rankCheckOption } from '@private/lib/PostgreSQL/rankCheckOption.mjs'

import type { ILockOrderSpec } from './ILockOrderSpec.mjs'
import type { ILockOrderTracker } from './ILockOrderTracker.mjs'

/**
 * Makes the tracker of the order of the locks, from a spec: the ranks of each mode, the rank each helper takes, and the
 * default mode. So that two requests can never wait for each other, a transaction takes its locks in the order of its
 * mode; the tracker throws `LockOrderError` when a lower rank is requested after a higher one. The kit ships no order.
 *
 * The state of a transaction is kept in a `WeakMap` that belongs to this tracker (no module-level state), keyed by the
 * handle that `withTx` hands out, so a retry starts again and nothing outlives the transaction. Make one tracker per spec,
 * once, where your lock helpers live, and call it from every helper: two trackers do not see each other's transactions.
 * The check is on unless `configure` or `track` turned it off. The spec is checked here (`TypeError` for a spec that
 * would leave the order silently off) and copied.
 */
export function createLockOrderTracker<TMode extends string, THelper extends string>(
	spec: ILockOrderSpec<TMode, THelper>
): ILockOrderTracker<TMode, THelper> {
	const plan = lockOrderPlan(spec)
	const states = new WeakMap<object, ITrackerState>()
	let rankCheckDefault = true

	const stateOf = (tx: object): ITrackerState => {
		let state = states.get(tx)
		if (state === undefined) {
			state = { order: plan.defaultOrder, rankCheck: rankCheckDefault, rank: 0, held: new Map() }
			states.set(tx, state)
		}
		return state
	}

	return {
		configure(config = {}) {
			rankCheckDefault = rankCheckOption(config.rankCheck) ?? true
		},
		track(tx, options = {}) {
			const order = options.mode === undefined ? plan.defaultOrder : plan.orders.get(options.mode)
			if (order === undefined) throw new TypeError(`mode must be one of ${[...plan.orders.keys()].join(', ')}`)
			const rankCheck = rankCheckOption(options.rankCheck)
			const state = stateOf(tx)
			if (state.rank > 0) {
				throw new LockOrderError('TRACKER_STARTED', 'the lock order mode of a transaction is set before its first lock')
			}
			state.order = order
			state.rankCheck = rankCheck ?? rankCheckDefault
		},
		admit: (tx, helper) => admitLock(plan, stateOf(tx), helper),
		record(tx, admission) {
			if (admission === undefined) return
			const state = stateOf(tx)
			state.rank = Math.max(state.rank, admission.rank)
		},
		hold(tx, key, strength) {
			if (!Number.isInteger(strength) || strength < 1) throw new TypeError('strength must be a whole number of at least 1')
			const { held } = stateOf(tx)
			held.set(key, Math.max(held.get(key) ?? 0, strength))
		},
		held: (tx, key) => states.get(tx)?.held.get(key) ?? 0
	}
}
