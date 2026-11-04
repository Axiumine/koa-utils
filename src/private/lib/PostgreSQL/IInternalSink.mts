import type { IDbCounter } from '@lib/PostgreSQL/counter/IDbCounter.mjs'
import type { IDbErrorFactory } from '@lib/PostgreSQL/error/IDbErrorFactory.mjs'
import type { IPoolLogger } from '@lib/PostgreSQL/pool/IPoolLogger.mjs'

/** What `internalFailure` needs: the factory's `internal`, a logger with `error`, and an optional counter over the names it emits. */
export interface IInternalSink<TError extends Error, TName extends string> {
	readonly errors: Pick<IDbErrorFactory<TError>, 'internal'>
	readonly logger: Pick<IPoolLogger, 'error'>
	readonly counter?: IDbCounter<TName>
}
