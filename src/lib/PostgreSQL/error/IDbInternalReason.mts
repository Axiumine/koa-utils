import type { DB_INTERNAL_REASONS } from './DB_INTERNAL_REASONS.mjs'

/** One of {@link DB_INTERNAL_REASONS}. */
export type IDbInternalReason = (typeof DB_INTERNAL_REASONS)[number]
