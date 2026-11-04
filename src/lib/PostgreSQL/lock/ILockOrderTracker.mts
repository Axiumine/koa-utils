import type { ILockAdmission } from './ILockAdmission.mjs'
import type { ILockTrackerConfig } from './ILockTrackerConfig.mjs'
import type { ILockTrackerOptions } from './ILockTrackerOptions.mjs'

/**
 * The tracker of the order of the locks in a transaction, made by `createLockOrderTracker`. It keeps one number per
 * transaction handle, in a `WeakMap` that belongs to this tracker, so a retry (which gets a fresh handle) starts again and
 * nothing is kept past the transaction. Two trackers are two separate sets of state. A helper of yours calls `admit` before
 * its statement, `record` when the statement took the lock, and `hold` for a lock that a later check wants to read.
 */
export interface ILockOrderTracker<TMode extends string = string, THelper extends string = string> {
	/**
	 * Sets the default of the rank check. Call it once at start, with a value you computed (the tracker reads no
	 * environment variable). With nothing, it restores `true`. It does not touch a transaction that is already tracked.
	 * A `TypeError` for a `rankCheck` that is not a boolean.
	 */
	configure(config?: ILockTrackerConfig): void
	/**
	 * Puts the transaction in a mode and/or forces its rank check. Call it right after `withTx` opened the transaction and
	 * before the first lock; after a recorded lock it throws `LockOrderError` `TRACKER_STARTED`. A `TypeError` for a mode
	 * that is not in the spec or a `rankCheck` that is not a boolean.
	 */
	track(tx: object, options?: ILockTrackerOptions<TMode>): void
	/**
	 * Checks the request against the order of the mode of the transaction, before the statement, and answers the rank to
	 * record, or `undefined` when the helper has no rank in this mode and the check is off. Nothing is recorded yet. A
	 * `LockOrderError` for a rank lower than one already recorded (`RANK_INVERSION`) and for a helper that does not belong
	 * to the mode (`MODE_REQUIRED`, `NOT_IN_MODE_ORDER`), when the check is on. A `TypeError` for a helper the spec does not
	 * name.
	 */
	admit(tx: object, helper: THelper): ILockAdmission | undefined
	/** Records an admitted rank once its lock was taken; `undefined` records nothing. The same rank again passes. */
	record(tx: object, admission: ILockAdmission | undefined): void
	/**
	 * Records the strength of a lock of the transaction under a key you chose (`1` weakest). A stronger lock replaces a
	 * weaker one and a weaker one never replaces a stronger one. Recorded also when the rank check is off. A `TypeError`
	 * for a strength that is not a whole number of at least 1.
	 */
	hold(tx: object, key: string, strength: number): void
	/** The strength recorded under the key, `0` when none. A read: it creates no state. */
	held(tx: object, key: string): number
}
