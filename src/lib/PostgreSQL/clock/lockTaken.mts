import type { ITx } from '@lib/PostgreSQL/tx/ITx.mjs'
import { clockSlot } from '@private/lib/PostgreSQL/clockSlot.mjs'

/**
 * Called by a lock helper after the statement that took its lock. Records that the transaction holds a lock and, when a
 * clock is bound and has not read yet, reads the instant now: the instant of the request is then the first one taken
 * after the first lock. When no clock is bound the read waits for the caller (`IDbClock.read`), which is allowed because
 * the lock is already taken. A transaction without a clock pays nothing: no statement is added.
 *
 * The state sits in a slot keyed by the transaction handle, held by the process-wide registry, so a retry that gets a
 * fresh handle starts with an empty slot, and a second copy of this package reaches the same slot.
 */
export async function lockTaken(tx: ITx): Promise<void> {
	const slot = clockSlot(tx)
	slot.locked = true
	if (slot.read !== undefined) await slot.read()
}
