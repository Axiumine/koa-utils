import type { IClock } from './IClock.mjs'

/** The clock of one transaction: the plain port plus the asynchronous read behind it. */
export interface IDbClock extends IClock {
	/** The instant of the transaction in epoch milliseconds; never touches the database. */
	now(): number
	/**
	 * Reads the instant: the first call in the transaction runs the one statement, every later call and every `now()` has
	 * the same value. Concurrent first calls share one statement.
	 */
	read(): Promise<number>
}
