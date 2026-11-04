import type { DB_STATE_REASONS } from './DB_STATE_REASONS.mjs'

/** One of {@link DB_STATE_REASONS}. */
export type IDbStateReason = (typeof DB_STATE_REASONS)[number]
