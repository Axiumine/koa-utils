import { lockTaken } from '@lib/PostgreSQL/clock/lockTaken.mjs'
import type { ITx } from '@lib/PostgreSQL/tx/ITx.mjs'

/**
 * Tells the database clock that a lock was taken, when the statement locked a row: a clock bound to the transaction
 * reads the instant right here, after the lock, and a write transaction may read the time from now on. A statement that
 * locked nothing (no such row) is not a lock taken. Answers the row it was given.
 */
export async function lockedRow<TRow>(tx: ITx, row: TRow | undefined): Promise<TRow | undefined> {
	if (row !== undefined) await lockTaken(tx)
	return row
}
