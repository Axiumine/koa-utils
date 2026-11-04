import type { IPoolCounter } from '@lib/PostgreSQL/pool/IPoolCounter.mjs'
import type { IPoolLogger } from '@lib/PostgreSQL/pool/IPoolLogger.mjs'

/** What the connect of one client needs besides the client. */
export interface IConnectSettings {
	readonly connectTimeoutMs: number
	readonly logger: IPoolLogger
	readonly count: IPoolCounter
}
