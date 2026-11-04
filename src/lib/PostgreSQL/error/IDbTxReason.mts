import type { DB_TX_REASONS } from './DB_TX_REASONS.mjs'

/** One of {@link DB_TX_REASONS}. */
export type IDbTxReason = (typeof DB_TX_REASONS)[number]
