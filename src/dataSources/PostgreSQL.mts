import * as Sentry from '@sentry/node'
import * as dotenv from 'dotenv'
import pg from 'pg'

const { Client, Pool } = pg

dotenv.config()

export const pgClient = new Client({
	user: `${process.env.POSTGRESQL_USER}`,
	password: `${process.env.POSTGRESQL_PWD}`,
	host: `${process.env.POSTGRESQL_HOST}`,
	port: parseInt(`${process.env.POSTGRESQL_PORT}`, 10),
	database: `${process.env.POSTGRESQL_DBNAME}`
})

export const pgPool = new Pool({
	user: `${process.env.POSTGRESQL_USER}`,
	password: `${process.env.POSTGRESQL_PWD}`,
	host: `${process.env.POSTGRESQL_HOST}`,
	port: parseInt(`${process.env.POSTGRESQL_PORT}`, 10),
	database: `${process.env.POSTGRESQL_DBNAME}`,
	max: parseInt(`${process.env.POSTGRESQL_POOL_MAX}`, 10),
	idleTimeoutMillis: parseInt(`${process.env.POSTGRESQL_IDLE_TIMEOUT}`, 10)
})

// the pool will emit an error on behalf of any idle clients
// it contains if a backend error or network partition happens
/* c8 ignore start -- idle-client error path: requires live pg backend partition, not unit-testable */
pgPool.on('error', (err) => {
	console.error('Unexpected error on idle client', err)
	process.exit(-1)
})
/* c8 ignore stop */

/*************************
 * Client, for transaction and single connection
 */

// Setting up a connection
export const PostgreSQLClientConnect = async () => {
	console.info('[PostgreSQL Client] Try connect to database... ')

	try {
		await pgClient.connect()

		// Attach an error listener only once
		if (!pgClient.listenerCount('error')) {
			pgClient.on('error', (e) => {
				const catchMex = '[PostgreSQL Client] something bad has happened!'
				Sentry.captureException(e, {
					extra: { detail: catchMex }
				})
				console.error(catchMex)
			})
		}
		if (!pgClient.listenerCount('notification')) {
			pgClient.on('notification', (msg) => {
				console.info('[PostgreSQL Client]', msg.channel)
				console.info('[PostgreSQL Client]', msg.payload)
				Sentry.captureMessage(`[PostgreSQL Client] notification: ${msg}`, {
					level: 'warning',
					extra: {
						channel: msg.channel,
						payload: msg.payload
					}
				})
			})
		}
		// https://www.postgresql.org/docs/9.6/static/plpgsql-errors-and-messages.html
		if (!pgClient.listenerCount('notice')) {
			pgClient.on('notice', (msg) => {
				Sentry.captureMessage(`[PostgreSQL Client] notice: ${msg}`, 'warning')
			})
		}
		console.info('[PostgreSQL Client] OK: PostgreSQL connection has been established successfully.')
	} catch (error) {
		throw {
			message: '[PostgreSQL Client] FAIL: Unable to connect to the database: ' + error,
			shutdown: true
		}
	}
}

export const PostgreSQLClientDisconnect = async () => {
	console.info('[PostgreSQL Client] Try close connection to database... ')
	try {
		await pgClient.end()
		console.info('[PostgreSQL Client] OK: PostgreSQL connection has been closed successfully.')
	} catch (error) {
		throw {
			message: '[PostgreSQL Client] FAIL: Unable to close the database connection: ' + error,
			shutdown: true
		}
	}
}

/*************************
 * Pool
 *
 * -- USE WITH --
 *
 * const pgPoolClient = await pgPool.connect()
 * your queries.. await client.query('YOUR_QUERY')
 * pgPoolClient.release()
 */

export const PostgreSQLPoolDisconnect = async () => {
	console.log('[PostgreSQL Pool] Try close connection to database... ')
	try {
		await pgPool.end()
		console.info('[PostgreSQL Pool] OK: PostgreSQL connection has been closed successfully.')
	} catch (error) {
		throw {
			message: '[PostgreSQL Pool] FAIL: Unable to close the database connection: ' + error,
			shutdown: true
		}
	}
}
