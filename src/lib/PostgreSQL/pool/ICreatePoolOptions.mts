import type { IDbDriver } from '@lib/PostgreSQL/pool/IDbDriver.mjs'
import type { IPoolCounter } from '@lib/PostgreSQL/pool/IPoolCounter.mjs'
import type { IPoolEvents } from '@lib/PostgreSQL/pool/IPoolEvents.mjs'
import type { IPoolLogger } from '@lib/PostgreSQL/pool/IPoolLogger.mjs'

/** The options of `createPool`. */
export interface ICreatePoolOptions<TPool extends IPoolEvents = IPoolEvents> {
	/** The node-postgres module. */
	readonly driver: IDbDriver<TPool>
	/**
	 * The connection string, `postgres://role@host:port/database`, with a password after the role and a colon and an
	 * optional query of `sslmode` and `sslrootcert`. The password may be left out when the server trusts the connection.
	 */
	readonly url: string
	/** The most connections the pool opens; a whole number from 1. */
	readonly max: number
	/** The `application_name` of every session, at most 63 characters of `A-Z a-z 0-9 _ . : -`. */
	readonly applicationName: string
	/** The logger of the service; the factory writes the idle-client errors and the connect failures to it. */
	readonly logger: IPoolLogger
	/** Where the factory counts. Default: nowhere. */
	readonly counter?: IPoolCounter
	/** Deadline of the connect, login and session check, in milliseconds. Default `DEFAULT_CONNECT_TIMEOUT_MS`. */
	readonly connectTimeoutMs?: number
	/** TCP keepalive on pooled connections. Default `true`. */
	readonly keepAlive?: boolean
	/** Idle time before the first keepalive probe, in milliseconds. Default `DEFAULT_KEEPALIVE_INITIAL_DELAY_MS`. */
	readonly keepAliveInitialDelayMs?: number
}
