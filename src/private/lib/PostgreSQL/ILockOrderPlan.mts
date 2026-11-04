import type { IModeOrder } from './IModeOrder.mjs'

/** A lock-order spec after the check and the copy: what a tracker reads, and no more. */
export interface ILockOrderPlan {
	readonly defaultOrder: IModeOrder
	readonly orders: ReadonlyMap<string, IModeOrder>
	/** The helpers the spec names. */
	readonly helpers: ReadonlySet<string>
}
