import type { IDbErrorFactory } from '@lib/PostgreSQL/error/IDbErrorFactory.mjs'
import type { IPoolLogger } from '@lib/PostgreSQL/pool/IPoolLogger.mjs'
import type { IRetryDelay } from '@lib/PostgreSQL/tx/IRetryDelay.mjs'
import type { ITxCounter } from '@lib/PostgreSQL/tx/ITxCounter.mjs'
import type { ITxIsolation } from '@lib/PostgreSQL/tx/ITxIsolation.mjs'

/** The options of `withTx`. */
export interface ITxOptions {
	/** The logger of the request or of the service; the retries and the failures are written to it. */
	readonly logger: IPoolLogger
	/**
	 * Builds the error the caller gets when the loop gives up: `errors.internal('TX_RETRY_EXHAUSTED')` or
	 * `errors.internal('LOCK_TIMEOUT')`. Any {@link IDbErrorFactory} fits; only `internal` is read.
	 */
	readonly errors: Pick<IDbErrorFactory, 'internal'>
	/** Where `withTx` counts. Default: nowhere. */
	readonly counter?: ITxCounter
	/** Default `READ COMMITTED`; `REPEATABLE READ` with `readOnly` is the snapshot reader. */
	readonly isolation?: ITxIsolation
	/** Adds `READ ONLY` at the requested isolation; a write then fails with SQLSTATE 25006. Default `false`. */
	readonly readOnly?: boolean
	/** `SET LOCAL lock_timeout`, a whole number of milliseconds from 1. Default `DEFAULT_LOCK_TIMEOUT_MS`. */
	readonly lockTimeoutMs?: number
	/** How many times the function is run again after 40001 or 40P01, from 0 to `TX_RETRY_MAX_CEILING`. Default `TX_RETRY_MAX`. */
	readonly retryMax?: number
	/** The wait before a retry. Default `defaultRetryDelay`. */
	readonly retryDelay?: IRetryDelay
}
