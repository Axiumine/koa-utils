import type { IDbErrorFactory } from '@lib/PostgreSQL/error/IDbErrorFactory.mjs'
import type { IPoolLogger } from '@lib/PostgreSQL/pool/IPoolLogger.mjs'
import type { IRetryDelay } from '@lib/PostgreSQL/tx/IRetryDelay.mjs'
import type { ITxCounter } from '@lib/PostgreSQL/tx/ITxCounter.mjs'

/** The options of `withTx` after the checks: every default applied and the two opening statements built. */
export interface ITxSettings {
	readonly logger: IPoolLogger
	readonly errors: Pick<IDbErrorFactory, 'internal'>
	readonly count: ITxCounter
	readonly begin: string
	readonly setLockTimeout: string
	readonly retryMax: number
	readonly retryDelay: IRetryDelay
}
