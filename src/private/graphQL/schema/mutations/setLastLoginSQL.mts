import { sequelize } from '@dataSources/MariaDB.mjs'
import * as Sentry from '@sentry/node'
import { QueryTypes } from 'sequelize'

export async function setLastLoginSQL(id: number): Promise<boolean> {
	// Get the current time in milliseconds since the Unix Epoch
	const now = Date.now()
	// Convert it to a Date object
	const date = new Date(now)
	const timestamp = date.toISOString().slice(0, 19).replace('T', ' ')

	let ret = false
	try {
		const sql = `UPDATE user
								 SET lastlogin = '${timestamp}'
								 WHERE id = ${id}`

		await sequelize.query(sql, {
			type: QueryTypes.UPDATE
		})

		ret = true
	} catch (e) {
		Sentry.captureException(e)
	}

	return ret
}
