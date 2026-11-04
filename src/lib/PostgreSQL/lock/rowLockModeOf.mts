import type { IRowLockMode } from './IRowLockMode.mjs'
import { ROW_LOCK_MODES } from './ROW_LOCK_MODES.mjs'

/** The mode itself when it is one of `ROW_LOCK_MODES`, otherwise a `TypeError` that names the list and never quotes the value. */
export function rowLockModeOf(value: unknown): IRowLockMode {
	if (!ROW_LOCK_MODES.includes(value as IRowLockMode)) {
		throw new TypeError(`mode must be one of ${ROW_LOCK_MODES.join(', ')}`)
	}
	return value as IRowLockMode
}
