import type { TX_FAILURE_REASONS } from './TX_FAILURE_REASONS.mjs'

/** One of {@link TX_FAILURE_REASONS}. */
export type ITxFailureReason = (typeof TX_FAILURE_REASONS)[number]
