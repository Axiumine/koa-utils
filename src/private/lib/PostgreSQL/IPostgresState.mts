import type { IClockSlot } from './IClockSlot.mjs'

/**
 * What every copy of the package shares: the per-transaction clock slots, keyed by the transaction handle. The registry
 * is frozen and holds no secret and no driver object: a flag, an epoch number, a promise and a function per handle.
 */
export interface IPostgresState {
	readonly layout: number
	readonly slots: WeakMap<object, IClockSlot>
}
