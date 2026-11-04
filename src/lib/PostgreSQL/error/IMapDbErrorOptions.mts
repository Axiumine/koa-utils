import type { IDbErrorCounter } from '@lib/PostgreSQL/error/IDbErrorCounter.mjs'
import type { IDbErrorFactory } from '@lib/PostgreSQL/error/IDbErrorFactory.mjs'
import type { IPoolLogger } from '@lib/PostgreSQL/pool/IPoolLogger.mjs'

import type { IConstraintTable } from './IConstraintTable.mjs'

/** The options of `mapDbError`. */
export interface IMapDbErrorOptions<TError extends Error = Error> {
	/** Builds every error `mapDbError` answers: `is` recognises an error of your family, `make` and `internal` build one. */
	readonly errors: IDbErrorFactory<TError>
	/** The constraint table: which constraint means which code. The application owns it; the kit holds none. */
	readonly table: IConstraintTable
	/** The logger of the request or of the service; only `error` is called. The reason and the constraint name are written to it. */
	readonly logger: Pick<IPoolLogger, 'error'>
	/** Where `mapDbError` counts. Default: nowhere. */
	readonly counter?: IDbErrorCounter
	/**
	 * The details fields that only the caller knows, for the constraint it expects to violate. Only the keys that the row
	 * of the table lists as `supplied` are used; a key for a row that lists none is ignored.
	 */
	readonly details?: Readonly<Record<string, unknown>>
	/** The code of a table row that means "a defect". Default `INTERNAL`, the code `errors.internal` is expected to build. */
	readonly internalCode?: string
}
