import type { IDbCounter } from '@lib/PostgreSQL/counter/IDbCounter.mjs'
import type { ITxCounterName } from '@lib/PostgreSQL/tx/ITxCounterName.mjs'

/** The counter callback of `withTx`: called once per event with one of the five transaction names. */
export type ITxCounter = IDbCounter<ITxCounterName>
