import type { DB_CONNECT_REASONS } from './DB_CONNECT_REASONS.mjs'

/** One of {@link DB_CONNECT_REASONS}. */
export type IDbConnectReason = (typeof DB_CONNECT_REASONS)[number]
