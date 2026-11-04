import type { IDbCounter } from '@lib/PostgreSQL/counter/IDbCounter.mjs'
import type { IDbErrorCounterName } from '@lib/PostgreSQL/error/IDbErrorCounterName.mjs'

/** The counter callback of `mapDbError`: called once per event with one of the two names of {@link IDbErrorCounterName}. */
export type IDbErrorCounter = IDbCounter<IDbErrorCounterName>
