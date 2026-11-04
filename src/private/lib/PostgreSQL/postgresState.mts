import { DbStateError } from '@lib/PostgreSQL/error/DbStateError.mjs'

import type { IPostgresState } from './IPostgresState.mjs'
import { POSTGRES_STATE_KEY } from './POSTGRES_STATE_KEY.mjs'
import { POSTGRES_STATE_LAYOUT } from './POSTGRES_STATE_LAYOUT.mjs'

/** True for a registry of this layout. The layout is the contract: a registry that carries it is read as one. */
function isSharedState(found: unknown): found is IPostgresState {
	return typeof found === 'object' && found !== null && Reflect.get(found, 'layout') === POSTGRES_STATE_LAYOUT
}

/** Makes the registry and puts it on `globalThis`, read-only, not enumerable. Throws if the global object refuses it. */
function installState(): IPostgresState {
	const state: IPostgresState = Object.freeze({ layout: POSTGRES_STATE_LAYOUT, slots: new WeakMap() })
	Object.defineProperty(globalThis, POSTGRES_STATE_KEY, { value: state, configurable: true })
	return state
}

/**
 * Finds the registry that an earlier copy of the package put on `globalThis` and uses it, or makes it when this is the
 * first copy. A value of another layout (a copy of another layout, or other code) is `DbStateError` `LAYOUT_MISMATCH`.
 */
function sharedState(): IPostgresState {
	const found: unknown = Reflect.get(globalThis, POSTGRES_STATE_KEY)
	if (found === undefined) return installState()
	if (isSharedState(found)) return found
	throw new DbStateError('LAYOUT_MISMATCH')
}

/**
 * The per-transaction state of the PostgreSQL kit, shared by every copy of the package in the process. It is read once,
 * when this module is loaded, so two copies that cannot share it fail at start. The clock and the lock helpers meet
 * through it: `lockTaken` of one copy reaches the clock that `createDbClock` of another copy bound.
 */
export const postgresState: IPostgresState = sharedState()
