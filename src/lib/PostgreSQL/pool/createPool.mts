import { createTypeRegistry } from '@lib/PostgreSQL/parse/createTypeRegistry.mjs'
import { DEFAULT_CONNECT_TIMEOUT_MS } from '@lib/PostgreSQL/pool/DEFAULT_CONNECT_TIMEOUT_MS.mjs'
import { DEFAULT_KEEPALIVE_INITIAL_DELAY_MS } from '@lib/PostgreSQL/pool/DEFAULT_KEEPALIVE_INITIAL_DELAY_MS.mjs'
import type { ICreatePoolOptions } from '@lib/PostgreSQL/pool/ICreatePoolOptions.mjs'
import type { IPoolEvents } from '@lib/PostgreSQL/pool/IPoolEvents.mjs'
import { assertPoolOptions } from '@private/lib/PostgreSQL/assertPoolOptions.mjs'
import { checkedClient } from '@private/lib/PostgreSQL/checkedClient.mjs'
import { errorCodeOf } from '@private/lib/PostgreSQL/errorCodeOf.mjs'
import type { IClientConstructor } from '@private/lib/PostgreSQL/IClientConstructor.mjs'
import { poolUrlSecrets } from '@private/lib/PostgreSQL/poolUrlSecrets.mjs'
import { scrubSecrets } from '@private/lib/PostgreSQL/scrubSecrets.mjs'

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : 'not an Error')

/**
 * Makes the pool of a service, in the order a connection meets the pieces:
 *
 * 1. The driver is a parameter. This module imports nothing from `pg`; it is given the module (`import pg from 'pg'` in
 *    the caller) and uses three members of it: `Pool`, `Client` and `types`.
 * 2. The URL is checked before the driver sees it, and the driver is given the URL only through the `connectionString`
 *    setting. The query of the URL may hold `sslmode` and `sslrootcert` and nothing else, because node-postgres lets a
 *    parameter of the URL replace a setting of the pool. A URL that fails is refused with a `DbConnectError` that holds
 *    no part of it.
 * 3. Every client of the pool is an instance of a subclass of the driver's `Client` (the `Client` option of the pool).
 *    Its `connect` runs, inside one deadline of `connectTimeoutMs`, the driver's connect, the login and the session
 *    check: `SHOW timezone` must answer `UTC`. A failure of any step ends the client and rejects the checkout with a
 *    `DbConnectError` that has a closed reason and no text of the driver, so a password in the URL cannot reach a
 *    message, a log line or a stack through it.
 * 4. The type parsers of {@link createTypeRegistry} are the `types` option of this pool only: no `Date` is built.
 * 5. An error of an idle client is an event of the pool; with no listener Node throws it and the process ends. The
 *    factory registers the listener: the event is logged (the driver's message passed through the scrub of the URL
 *    secrets) and counted.
 *
 * The `connectionTimeoutMillis` setting of the driver is not passed. It bounds the socket and the login only; a server
 * that accepts, logs in and then never answers the first query would hang the session check, and the driver's timeout
 * error is plain text that cannot carry a reason. The deadline of this module covers all three steps and has the reason
 * `CONNECT_TIMEOUT`. The keepalive settings are the driver's own (`keepAlive`, `keepAliveInitialDelayMillis`).
 *
 * It returns the instance of the driver's `Pool` class, so the caller's own types (`pg.Pool`) apply. Throws `TypeError`
 * for a parameter that is out of range (before anything is created) and `DbConnectError` with reason `URL_INVALID` for a
 * URL that does not pass the check.
 */
export function createPool<TPool extends IPoolEvents>(options: ICreatePoolOptions<TPool>): TPool {
	const { driver, url, max, applicationName, logger } = options
	const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
	const keepAliveInitialDelayMs = options.keepAliveInitialDelayMs ?? DEFAULT_KEEPALIVE_INITIAL_DELAY_MS
	const count = options.counter ?? ((): void => undefined)
	assertPoolOptions({ max, applicationName, connectTimeoutMs, keepAliveInitialDelayMs })
	const secrets = poolUrlSecrets(url)

	const Client = checkedClient(driver.Client as unknown as IClientConstructor, { connectTimeoutMs, logger, count })
	const PoolClass = driver.Pool as unknown as new (config: Record<string, unknown>) => TPool
	const pool = new PoolClass({
		connectionString: url,
		max,
		application_name: applicationName,
		keepAlive: options.keepAlive ?? true,
		keepAliveInitialDelayMillis: keepAliveInitialDelayMs,
		types: createTypeRegistry(driver.types),
		Client
	})
	pool.on('error', (error) => {
		count('db_pool_idle_client_errors_total')
		const code = errorCodeOf(error)
		logger.error('database pool idle client error', {
			reason: 'IDLE_CLIENT_ERROR',
			...(code === undefined ? {} : { errorCode: code }),
			detail: scrubSecrets(messageOf(error), secrets)
		})
	})
	return pool
}
