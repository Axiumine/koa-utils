import type { IDbCounter } from '@lib/PostgreSQL/counter/IDbCounter.mjs'
import type { IPoolCounterName } from '@lib/PostgreSQL/pool/IPoolCounterName.mjs'

/** The counter callback of the pool factory: called once per event with one of the two pool names. */
export type IPoolCounter = IDbCounter<IPoolCounterName>
