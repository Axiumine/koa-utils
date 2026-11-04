import type { IModeOrder } from './IModeOrder.mjs'

/** What a tracker knows about one transaction. */
export interface ITrackerState {
	order: IModeOrder
	rankCheck: boolean
	/** The highest rank recorded in this transaction, 0 when none. */
	rank: number
	/** The strength of the locks recorded with `hold`, by key. */
	held: Map<string, number>
}
