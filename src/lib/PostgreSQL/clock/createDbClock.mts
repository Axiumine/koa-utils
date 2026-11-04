import { DbClockError } from '@lib/PostgreSQL/error/DbClockError.mjs'
import type { ITx } from '@lib/PostgreSQL/tx/ITx.mjs'
import { clockInstant } from '@private/lib/PostgreSQL/clockInstant.mjs'
import { clockSlot } from '@private/lib/PostgreSQL/clockSlot.mjs'
import { clockStatement } from '@private/lib/PostgreSQL/clockStatement.mjs'

import type { IDbClock } from './IDbClock.mjs'
import type { IDbClockOptions } from './IDbClockOptions.mjs'

/**
 * Makes the clock of a transaction: the server time as epoch milliseconds, read from the database once per transaction, so
 * that every comparison in one request uses one instant and no application host clock decides a deadline.
 *
 * `now()` is synchronous and never touches the database: it answers the instant that was read. `read()` is the
 * asynchronous one: the first call runs the one statement (`CLOCK_SQL`, or the statement of the seam), every later call
 * returns the same value, and concurrent first calls share one statement. A read that failed is not retried: its failure
 * is the answer of every later call. The lock helpers call `lockTaken` after the lock they took, which reads for a bound
 * clock, so in a write transaction `now()` is ready as soon as the first lock helper returns.
 *
 * A transaction flagged `write: true` must take a lock before it reads the time, so that the instant it stamps on its rows
 * is later than the commit of every transaction that held the same lock before it. `now()` and `read()` before the first
 * lock helper has returned throw `DbClockError` `WRITE_BEFORE_LOCK`, a defect of the calling code. A read-only
 * transaction has no such guard.
 *
 * Call it once, where the transaction opens (inside `withTx`), before or after the first lock helper. The checks, in
 * order: `TypeError` for a `write` that is not a boolean; the seam (`TypeError` out of its type, `SEAM_REFUSED` when it is
 * not allowed); `ALREADY_BOUND` for a second clock on the same handle. Nothing is sent to the database before the first read.
 */
export function createDbClock(tx: ITx, options: IDbClockOptions): IDbClock {
	const { write } = options
	if (typeof write !== 'boolean') throw new TypeError('write must be a boolean')
	const statement = clockStatement(options.seam)
	const slot = clockSlot(tx)
	if (slot.read !== undefined) throw new DbClockError('ALREADY_BOUND')

	const fetchInstant = async (): Promise<number> => {
		const { rows } = await tx.query<{ ms?: unknown }>(statement)
		const instant = clockInstant(rows)
		slot.instant = instant
		return instant
	}

	const read = (): Promise<number> => {
		if (write && !slot.locked) return Promise.reject(new DbClockError('WRITE_BEFORE_LOCK'))
		slot.pending ??= fetchInstant()
		return slot.pending
	}
	slot.read = read

	return {
		now(): number {
			if (slot.instant !== undefined) return slot.instant
			throw new DbClockError(write && !slot.locked ? 'WRITE_BEFORE_LOCK' : 'NOT_READ')
		},
		read
	}
}
