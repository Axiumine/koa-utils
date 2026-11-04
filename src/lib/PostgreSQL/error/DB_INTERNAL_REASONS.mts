/**
 * The closed reasons of the error that `mapDbError` and `guardVersion` ask their error factory for with
 * `errors.internal(reason)`. They are for the log and the developer: an application that formats errors for a response
 * should keep the reason out of the body. The two reasons of `withTx` (`TX_FAILURE_REASONS`) are separate.
 *
 * - `CONSTRAINT_UNMAPPED`: a violation (SQLSTATE 23505, 23514 or 23503) names a constraint that the table does not hold,
 *   or names none. The name, when it is a plain identifier, is logged.
 * - `CONSTRAINT_INTERNAL`: the constraint is in the table and the table maps it to the internal code (a violation that
 *   can only be a defect). The name is logged.
 * - `DETAILS_NOT_SUPPLIED`: the table says the caller supplies detail fields for this constraint and the call did not
 *   supply all of them; the error would break the details its code is typed with.
 * - `DB_ERROR`: the driver reported a SQLSTATE that is not one of the three above (a missing grant, a statement timeout,
 *   a server shutting down, ...). The SQLSTATE is logged.
 * - `DB_VALUE_UNREADABLE`, `DB_CONNECTION`, `DB_TX_MISUSE`: a `DbParseError`, a `DbConnectError` or a `DbTxError`. The
 *   closed reason of the typed error is logged.
 * - `UNEXPECTED_ERROR`: anything else (a `TypeError`, an error of another library, a value that is no error). The name
 *   of its class is logged, never its message.
 * - `VERSION_UNCHANGED`: `guardVersion` re-read a visible row that still has the version the failed update was guarded
 *   with, so the update missed for a reason the guard cannot name.
 * - `REREAD_UNREADABLE`: the statement that `guardVersion` was given answered more than one row, or a row without a
 *   readable version column.
 */
export const DB_INTERNAL_REASONS = [
	'CONSTRAINT_UNMAPPED',
	'CONSTRAINT_INTERNAL',
	'DETAILS_NOT_SUPPLIED',
	'DB_ERROR',
	'DB_VALUE_UNREADABLE',
	'DB_CONNECTION',
	'DB_TX_MISUSE',
	'UNEXPECTED_ERROR',
	'VERSION_UNCHANGED',
	'REREAD_UNREADABLE'
] as const
