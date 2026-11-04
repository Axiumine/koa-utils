import { DbConnectError } from '@lib/PostgreSQL/error/DbConnectError.mjs'
import { REQUIRED_SESSION_TIME_ZONE } from '@lib/PostgreSQL/pool/REQUIRED_SESSION_TIME_ZONE.mjs'

import { errorCodeOf } from './errorCodeOf.mjs'
import type { IClientShape } from './IClientShape.mjs'
import type { IConnectSettings } from './IConnectSettings.mjs'

/** The error a failure of the connect, the login or the check is reported as. */
const connectErrorOf = (error: unknown): DbConnectError =>
	error instanceof DbConnectError ? error : new DbConnectError('CONNECT_FAILED', errorCodeOf(error))

async function checkSessionZone(client: IClientShape): Promise<void> {
	const answer = await client.query('SHOW timezone')
	if (answer.rows[0]?.['TimeZone'] !== REQUIRED_SESSION_TIME_ZONE) throw new DbConnectError('TIMEZONE_NOT_UTC')
}

/**
 * The connect of one client: the driver's connect, then `SHOW timezone`, all inside one deadline of
 * `connectTimeoutMs`. Resolves when the session is ready for the caller. On any failure it counts, logs the closed
 * reason (never the text of the driver), ends the client and rejects with a `DbConnectError`.
 */
export async function connectAndCheck(
	client: IClientShape,
	connect: () => Promise<unknown>,
	settings: IConnectSettings
): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			reject(new DbConnectError('CONNECT_TIMEOUT'))
		}, settings.connectTimeoutMs)
	})
	// An async wrapper, so a `connect` that throws before it returns a promise is a rejection too, handled below.
	const work = (async (): Promise<void> => {
		await connect()
		await checkSessionZone(client)
	})()
	try {
		await Promise.race([work, deadline])
	} catch (error) {
		const failure = connectErrorOf(error)
		settings.count('db_pool_connect_failures_total')
		settings.logger.warn('database connection refused', {
			reason: failure.reason,
			...(failure.code === undefined ? {} : { errorCode: failure.code })
		})
		// The client is of no use. The end is not awaited: on a socket that never answers it may not settle, and the caller is
		// waiting for this rejection.
		client.end().catch(() => undefined)
		throw failure
	} finally {
		clearTimeout(timer)
	}
}
