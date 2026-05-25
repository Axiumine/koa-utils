import * as Sentry from '@sentry/node'
import * as dotenv from 'dotenv'
import { Sequelize } from 'sequelize-typescript'

dotenv.config()

export const sequelize = new Sequelize(
	`${process.env.MARIADB_DBNAME}`,
	`${process.env.MARIADB_USER}`,
	`${process.env.MARIADB_PWD}`,
	{
		host: `${process.env.MARIADB_IP}`,
		dialect: 'mariadb',
		query: { raw: true },
		pool: {
			// handleDisconnects: true,
			max: 13,
			min: 1,
			idle: 10000,
			acquire: 20000
		},
		retry: {
			/* match: [
				Sequelize.ConnectionError,
				Sequelize.ConnectionTimedOutError,
				Sequelize.TimeoutError,
				/Deadlock/i,
			], */
			backoffBase: 100,
			backoffExponent: 1.1,
			timeout: 3000,
			backoffJitter: 0.1, // Add this required property
			max: parseInt(`${process.env.MARIADB_RETRY}`) || 5
		},
		dialectOptions: {
			useUTC: true,
			skipSetTimezone: true,
			compress: true,
			requestTimeout: parseInt(`${process.env.MARIADB_TIMEOUT}`) || 5000
		},
		port: parseInt(`${process.env.MARIADB_PORT}`, 10),
		/* c8 ignore next -- env-dependent boot config; covered only when MARIADB_LOGGING='false' */
		logging: process.env.MARIADB_LOGGING === 'false' ? false : undefined // disable print queries in console
	}
)

// Setting up a connection
export const MariaDBConnect = async () => {
	console.info('[MariaDB] Try connect to database... ')
	try {
		await sequelize.authenticate()
		console.info('[MariaDB] OK: MariaDB connection has been established successfully.')
	} catch (e) {
		const catchMex = '[MariaDB] FAIL: Unable to connect to the database'
		Sentry.captureException(e, {
			extra: { detail: catchMex }
		})
		throw {
			message: catchMex,
			shutdown: true
		}
	}
	return sequelize
}

export const MariaDBDisconnect = async () => {
	console.info('[MariaDB] Try close connection to database... ')
	try {
		await sequelize.close()
		console.info('[MariaDB] OK: MariaDB connection has been closed successfully.')
	} catch (e) {
		const catchMex = '[MariaDB] FAIL: Unable to close the database connection: '
		Sentry.captureException(e, {
			extra: { detail: 'Error during database disconnection' }
		})
		throw {
			message: catchMex,
			shutdown: true
		}
	}
}
