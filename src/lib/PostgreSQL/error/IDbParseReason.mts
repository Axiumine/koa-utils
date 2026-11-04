import type { DB_PARSE_REASONS } from './DB_PARSE_REASONS.mjs'

/** One of {@link DB_PARSE_REASONS}. */
export type IDbParseReason = (typeof DB_PARSE_REASONS)[number]
