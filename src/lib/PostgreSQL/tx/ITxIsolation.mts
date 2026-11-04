import type { TX_ISOLATION_LEVELS } from './TX_ISOLATION_LEVELS.mjs'

/** One of {@link TX_ISOLATION_LEVELS}. */
export type ITxIsolation = (typeof TX_ISOLATION_LEVELS)[number]
