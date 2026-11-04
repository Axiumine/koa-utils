import { sqlstateOf } from '@lib/PostgreSQL/error/sqlstateOf.mjs'
import type { ITx } from '@lib/PostgreSQL/tx/ITx.mjs'
import type { ITxPool } from '@lib/PostgreSQL/tx/ITxPool.mjs'

import type { ITxSettings } from './ITxSettings.mjs'
import { runTxAttempt } from './runTxAttempt.mjs'
import { txFailure } from './txFailure.mjs'

const SERIALIZATION_FAILURE = '40001'
const DEADLOCK_DETECTED = '40P01'
const LOCK_NOT_AVAILABLE = '55P03'

/**
 * The retry loop of `withTx`, written as a recursion so that it has no exit that cannot be reached. `retries` is the
 * number of retries already made. An attempt that fails with 55P03 ends the loop at once; one that fails with 40001 or
 * 40P01 is run again after the injected delay until `settings.retryMax` retries are spent; any other failure is
 * rethrown unchanged. The recursive call is outside the `try`, so a failure of a later attempt is not classified twice.
 */
export async function runTxWithRetries<T>(
	pool: ITxPool,
	settings: ITxSettings,
	fn: (tx: ITx) => Promise<T>,
	retries: number
): Promise<T> {
	try {
		return await runTxAttempt(pool, settings, fn)
	} catch (error) {
		const sqlstate = sqlstateOf(error)
		if (sqlstate === LOCK_NOT_AVAILABLE) throw txFailure(settings, 'LOCK_TIMEOUT', sqlstate, retries + 1)
		if (sqlstate !== SERIALIZATION_FAILURE && sqlstate !== DEADLOCK_DETECTED) throw error
		if (retries >= settings.retryMax) throw txFailure(settings, 'TX_RETRY_EXHAUSTED', sqlstate, retries + 1)
		settings.count('db_tx_retries_total')
		settings.logger.warn('database transaction retried', { reason: 'TX_RETRY', sqlstate, retry: retries + 1 })
		await settings.retryDelay(retries + 1)
	}
	return runTxWithRetries(pool, settings, fn, retries + 1)
}
