import { errorNameOf } from '@lib/PostgreSQL/error/errorNameOf.mjs'
import { sqlstateOf } from '@lib/PostgreSQL/error/sqlstateOf.mjs'
import { internalFailure } from '@private/lib/PostgreSQL/internalFailure.mjs'
import { mapTypedError } from '@private/lib/PostgreSQL/mapTypedError.mjs'
import { mapViolation } from '@private/lib/PostgreSQL/mapViolation.mjs'

import type { IMapDbErrorOptions } from './IMapDbErrorOptions.mjs'

/** Unique violation, check violation and foreign key violation: the three that are looked up by constraint name. */
const VIOLATION_SQLSTATES: ReadonlySet<string> = new Set(['23505', '23514', '23503'])

/**
 * The one translation of a database failure into the closed vocabulary of your own error family. It answers an error of
 * `options.errors` for every input, so the catch block of a handler is `throw mapDbError(error, { errors, table, logger })`.
 *
 * What it does, in order:
 *
 * 1. An error that `errors.is` recognises (what `withTx` throws, or an error of yours) is returned as it is, the same
 *    object, without a log line or a count.
 * 2. A `DbParseError`, a `DbConnectError` or a `DbTxError` becomes `errors.internal` with a reason of its own
 *    (`DB_VALUE_UNREADABLE`, `DB_CONNECTION`, `DB_TX_MISUSE`).
 * 3. SQLSTATE `23505` (unique), `23514` (check) and `23503` (foreign key) are looked up by the name of the constraint in
 *    the error (the `constraint` field the server fills) in `options.table`:
 *    - a row gives `errors.make(code, details)` with the details the row fixes and the ones the caller supplied
 *      (`options.details`, only the keys the row lists);
 *    - a name that is not in the table, or no name at all, gives `errors.internal('CONSTRAINT_UNMAPPED')`: the name is
 *      logged and counted, the response carries nothing of it.
 * 4. Any other SQLSTATE gives `errors.internal('DB_ERROR')`, anything else `errors.internal('UNEXPECTED_ERROR')`.
 *
 * What an internal error of this function carries is a reason from `DB_INTERNAL_REASONS` and nothing else. The log line
 * carries the reason, the SQLSTATE, the constraint name (when it is a plain identifier), the closed reason of a typed
 * error and, for an unexpected error, the name of its class. Nothing else of the failure is read: not the message, not the
 * `detail` (it quotes the failing row, so the bound values), not `query`, `values` or `parameters` if a wrapper put them on
 * the error, not the stack.
 *
 * It does not throw, and it reads `options.errors.make` only for a row of the table.
 */
export function mapDbError<TError extends Error>(error: unknown, options: IMapDbErrorOptions<TError>): TError {
	if (options.errors.is(error)) return error
	const typed = mapTypedError(error, options)
	if (typed !== undefined) return typed
	const sqlstate = sqlstateOf(error)
	if (sqlstate === undefined) {
		const name = errorNameOf(error)
		return internalFailure(options, 'db_error_internal_total', 'unexpected error at the database boundary', {
			reason: 'UNEXPECTED_ERROR',
			...(name === undefined ? {} : { errorName: name })
		})
	}
	if (VIOLATION_SQLSTATES.has(sqlstate)) return mapViolation(error, sqlstate, options)
	return internalFailure(options, 'db_error_internal_total', 'database error', { reason: 'DB_ERROR', sqlstate })
}
