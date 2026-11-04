import { DbConnectError } from '@lib/PostgreSQL/error/DbConnectError.mjs'
import { DbParseError } from '@lib/PostgreSQL/error/DbParseError.mjs'
import { DbTxError } from '@lib/PostgreSQL/error/DbTxError.mjs'
import type { IMapDbErrorOptions } from '@lib/PostgreSQL/error/IMapDbErrorOptions.mjs'

import { internalFailure } from './internalFailure.mjs'

/** The typed errors of the kit, each with the reason of its own and the closed reason it carries; `undefined` for any other value. */
export function mapTypedError<TError extends Error>(error: unknown, options: IMapDbErrorOptions<TError>): TError | undefined {
	if (error instanceof DbParseError) {
		return internalFailure(options, 'db_error_internal_total', 'database value cannot be read', {
			reason: 'DB_VALUE_UNREADABLE',
			errorReason: error.reason,
			typeName: error.typeName
		})
	}
	if (error instanceof DbConnectError) {
		return internalFailure(options, 'db_error_internal_total', 'database connection refused', {
			reason: 'DB_CONNECTION',
			errorReason: error.reason
		})
	}
	if (error instanceof DbTxError) {
		return internalFailure(options, 'db_error_internal_total', 'database transaction misused', {
			reason: 'DB_TX_MISUSE',
			errorReason: error.reason
		})
	}
	return undefined
}
