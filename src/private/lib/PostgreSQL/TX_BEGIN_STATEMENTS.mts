import type { ITxIsolation } from '@lib/PostgreSQL/tx/ITxIsolation.mjs'

/**
 * The statement that opens a transaction, by isolation level: read-write first, read-only second. Literals on
 * purpose: nothing is interpolated into a `BEGIN`. A `Map`, so that a key that is not an own entry (`toString`) finds
 * nothing.
 */
export const TX_BEGIN_STATEMENTS: ReadonlyMap<ITxIsolation, readonly [string, string]> = new Map([
	['READ COMMITTED', ['BEGIN ISOLATION LEVEL READ COMMITTED', 'BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY']],
	['REPEATABLE READ', ['BEGIN ISOLATION LEVEL REPEATABLE READ', 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY']],
	['SERIALIZABLE', ['BEGIN ISOLATION LEVEL SERIALIZABLE', 'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY']]
] as const)
