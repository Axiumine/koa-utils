import type { IDbCounter } from '@lib/PostgreSQL/counter/IDbCounter.mjs'

/** The counter callback of `guardVersion`: called with `db_error_internal_total` when it answers the internal error. */
export type IGuardCounter = IDbCounter<'db_error_internal_total'>
