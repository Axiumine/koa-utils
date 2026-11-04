import type { IDbErrorFactory } from '@lib/PostgreSQL/error/IDbErrorFactory.mjs'
import type { IPoolLogger } from '@lib/PostgreSQL/pool/IPoolLogger.mjs'

import type { IGuardCounter } from './IGuardCounter.mjs'
import type { IVersionGuardField } from './IVersionGuardField.mjs'

/** The input of `guardVersion`. */
export interface IVersionGuardInput<TError extends Error = Error> {
	/**
	 * The statement that reads the row again, in the transaction of the failed update. It carries the visibility predicate
	 * of the actor (for a row of a group: the actor is an active member of it) and the id, and answers no row when the row
	 * is absent or the actor may not see it, and one row with the column named by `field` otherwise. The text is a
	 * literal; the values are parameters.
	 */
	readonly reread: { readonly text: string; readonly values?: readonly unknown[] }
	/** The version (or rev) that the failed update was guarded with: the one the client sent. */
	readonly expected: number
	/** The guarded column: `version` (`STALE_VERSION`) or `rev` (`STALE_REV`). */
	readonly field: IVersionGuardField
	/** The kind of row, for `NOT_FOUND` (`order`, `membership`, ...): the details are `{ entity }`. */
	readonly entity: string
	/** Builds every error `guardVersion` answers: `make` for `NOT_FOUND`, `STALE_VERSION` and `STALE_REV`, `internal` for the rest. */
	readonly errors: Pick<IDbErrorFactory<TError>, 'make' | 'internal'>
	/** Where the internal cases are logged; only `error` is called. */
	readonly logger: Pick<IPoolLogger, 'error'>
	/** Where `guardVersion` counts. Default: nowhere. */
	readonly counter?: IGuardCounter
}
