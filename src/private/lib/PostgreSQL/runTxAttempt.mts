import { sqlstateField } from '@lib/PostgreSQL/error/sqlstateField.mjs'
import { sqlstateOf } from '@lib/PostgreSQL/error/sqlstateOf.mjs'
import type { ITx } from '@lib/PostgreSQL/tx/ITx.mjs'
import type { ITxPool } from '@lib/PostgreSQL/tx/ITxPool.mjs'

import type { ITxHandleState } from './ITxHandleState.mjs'
import type { ITxSettings } from './ITxSettings.mjs'
import { runTxBody } from './runTxBody.mjs'

/**
 * One attempt: a connection, the transaction, `fn`, and the commit or the rollback.
 *
 * The connection gets a listener for its `error` event for as long as it is held, because an event nobody handles ends
 * the process. A connection that emitted one, and one whose rollback failed, is destroyed instead of returned to the
 * pool. A rollback that fails does not hide the error that caused it. A `COMMIT` the server answers with the tag
 * `ROLLBACK` throws the first failed statement of the handle, or `DbTxError` `COMMIT_ROLLED_BACK` when none is known.
 */
export async function runTxAttempt<T>(pool: ITxPool, settings: ITxSettings, fn: (tx: ITx) => Promise<T>): Promise<T> {
	const client = await pool.connect()
	let destroy = false
	const onClientError = (error: Error): void => {
		destroy = true
		settings.count('db_tx_client_errors_total')
		settings.logger.error('database client error during transaction', {
			reason: 'CLIENT_ERROR',
			...sqlstateField(sqlstateOf(error))
		})
	}
	client.on('error', onClientError)
	const state: ITxHandleState = { open: true, failed: false, failure: undefined }
	let result: T
	try {
		result = await runTxBody(client, settings, fn, state)
	} catch (error) {
		state.open = false
		try {
			await client.query('ROLLBACK')
		} catch (rollbackError) {
			destroy = true
			settings.count('db_tx_rollback_failures_total')
			settings.logger.error('database transaction rollback failed', {
				reason: 'ROLLBACK_FAILED',
				...sqlstateField(sqlstateOf(rollbackError))
			})
		}
		throw error
	} finally {
		client.removeListener('error', onClientError)
		client.release(destroy)
	}
	return result
}
