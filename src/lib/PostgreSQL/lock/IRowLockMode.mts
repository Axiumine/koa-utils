import type { ROW_LOCK_MODES } from './ROW_LOCK_MODES.mjs'

/** One of {@link ROW_LOCK_MODES}. */
export type IRowLockMode = (typeof ROW_LOCK_MODES)[number]
