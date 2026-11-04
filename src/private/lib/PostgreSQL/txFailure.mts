import type { ITxFailureReason } from '@lib/PostgreSQL/tx/ITxFailureReason.mjs'

import type { ITxSettings } from './ITxSettings.mjs'

/** Counts and logs a failure that ends the loop, and builds the error the caller gets from the error factory. */
export function txFailure(settings: ITxSettings, reason: ITxFailureReason, sqlstate: string, attempts: number): Error {
	settings.count(reason === 'LOCK_TIMEOUT' ? 'db_tx_lock_timeouts_total' : 'db_tx_retry_exhausted_total')
	settings.logger.error('database transaction failed', { reason, sqlstate, attempts })
	return settings.errors.internal(reason)
}
