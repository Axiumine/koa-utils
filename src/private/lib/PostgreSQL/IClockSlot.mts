/** What is known about the clock of one transaction. */
export interface IClockSlot {
	/** True once a lock helper has taken a lock in this transaction. */
	locked: boolean
	/** The instant, in epoch milliseconds, once it was read. */
	instant: number | undefined
	/** The read that is under way, so that concurrent callers share one statement. */
	pending: Promise<number> | undefined
	/** Set by `createDbClock`: reads the instant (once) with the statement of that clock. */
	read: (() => Promise<number>) | undefined
}
