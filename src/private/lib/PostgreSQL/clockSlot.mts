import type { IClockSlot } from './IClockSlot.mjs'
import { postgresState } from './postgresState.mjs'

/** The slot of the transaction, made empty on first use. */
export function clockSlot(tx: object): IClockSlot {
	let slot = postgresState.slots.get(tx)
	if (slot === undefined) {
		slot = { locked: false, instant: undefined, pending: undefined, read: undefined }
		postgresState.slots.set(tx, slot)
	}
	return slot
}
