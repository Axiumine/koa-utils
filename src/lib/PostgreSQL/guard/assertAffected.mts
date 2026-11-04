import type { IAffectedResult } from './IAffectedResult.mjs'

/**
 * Throws `onMismatch` unless the statement affected exactly `expected` rows. `onMismatch` is the error to throw, or a
 * function that builds it (so that a call that succeeds builds no error); it comes from the caller, built with the
 * caller's own error family, so nothing here imports one. A count the server did not report (`null`, the answer of a
 * statement that is not a `SELECT`, `INSERT`, `UPDATE` or `DELETE`) is not `expected`: nothing was proved, so nothing is
 * reported as a success. `expected` is a whole number from 0; anything else is a `TypeError`, thrown before the count is
 * read.
 */
export function assertAffected(result: IAffectedResult, expected: number, onMismatch: Error | (() => Error)): void {
	if (!Number.isSafeInteger(expected) || expected < 0) {
		throw new TypeError('expected must be a whole number of rows from 0')
	}
	if (result.rowCount === expected) return
	throw typeof onMismatch === 'function' ? onMismatch() : onMismatch
}
