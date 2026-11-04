/* eslint-disable sonarjs/no-redundant-optional -- under exactOptionalPropertyTypes `?: T` rejects an explicit `undefined`, so `| undefined` is what lets a caller pass `{ rankCheck: maybeValue }` */
import type { IDbClockSeam } from './IDbClockSeam.mjs'

/** What `createDbClock` takes. */
export interface IDbClockOptions {
	/**
	 * True for a transaction that writes: its clock refuses to answer before a lock helper has returned. Required, with no
	 * default, so that the choice is made in the code that opens the transaction.
	 */
	readonly write: boolean
	/** A replacement for the statement (a test build). Default: none, the clock reads `CLOCK_SQL`. */
	readonly seam?: IDbClockSeam | undefined
}
