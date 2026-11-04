import type { DB_CLOCK_REASONS } from './DB_CLOCK_REASONS.mjs'

/** One of {@link DB_CLOCK_REASONS}. */
export type IDbClockReason = (typeof DB_CLOCK_REASONS)[number]
