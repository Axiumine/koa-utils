import { lockTaken } from '@lib/PostgreSQL/clock/lockTaken.mjs'
import type { ITx } from '@lib/PostgreSQL/tx/ITx.mjs'

/** The same as `lockedRow` for a list of locked rows: a lock was taken when the list is not empty. Answers the list it was given. */
export async function lockedRows<TRow>(tx: ITx, rows: TRow[]): Promise<TRow[]> {
	if (rows.length > 0) await lockTaken(tx)
	return rows
}
