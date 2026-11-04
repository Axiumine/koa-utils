import type { IDbInternalReason } from '@lib/PostgreSQL/error/IDbInternalReason.mjs'
import type { ITx } from '@lib/PostgreSQL/tx/ITx.mjs'
import { assertVersionGuardInput } from '@private/lib/PostgreSQL/assertVersionGuardInput.mjs'
import { internalFailure } from '@private/lib/PostgreSQL/internalFailure.mjs'
import { readField } from '@private/lib/PostgreSQL/readField.mjs'
import { versionText } from '@private/lib/PostgreSQL/versionText.mjs'

import type { IVersionGuardCode } from './IVersionGuardCode.mjs'
import type { IVersionGuardInput } from './IVersionGuardInput.mjs'

/** Logs, counts and builds the internal error for a re-read that cannot decide. */
function undecided<TError extends Error>(input: IVersionGuardInput<TError>, reason: IDbInternalReason): TError {
	return internalFailure(input, 'db_error_internal_total', 'version guard cannot decide', {
		reason,
		field: input.field,
		entity: input.entity
	})
}

/**
 * Says why an update guarded by `WHERE id = $1 AND version = $2` (or `rev`) affected no row, and answers the error for the
 * caller to throw (it does not throw it, so `throw await guardVersion(...)` ends the flow for the compiler too):
 *
 * - `errors.make('NOT_FOUND', { entity })` when the re-read finds no row: the row is absent, or the actor may not see it.
 *   The two cases are one answer on purpose, so a call by id never confirms that a row exists to someone who may not see
 *   it, and a stale version of such a row is `NOT_FOUND`, never `STALE_VERSION`;
 * - `errors.make('STALE_VERSION')` (`field` `version`) or `errors.make('STALE_REV')` (`field` `rev`) when the actor sees
 *   the row and it has another version than `expected`;
 * - `errors.internal('VERSION_UNCHANGED')` when the actor sees the row and it still has `expected`: the update missed for
 *   a reason this guard cannot name, which a version-only guard should not have;
 * - `errors.internal('REREAD_UNREADABLE')` when the statement answered more than one row or no readable column.
 *
 * A failure of the re-read itself is thrown unchanged, for `mapDbError` or `withTx` to classify. Call it in the
 * transaction of the update, so that the re-read sees what the update saw. It builds no SQL and logs no bound value: the
 * statement runs as given, a literal with parameters written by the caller, who owns the table and the visibility rule.
 * `TypeError` for a `field`, an `expected` or an `entity` out of shape, before any statement.
 */
export async function guardVersion<TError extends Error>(
	tx: Pick<ITx, 'query'>,
	input: IVersionGuardInput<TError>
): Promise<TError> {
	assertVersionGuardInput(input)
	const answer = await tx.query(input.reread.text, input.reread.values)
	const [row, ...more] = answer.rows
	if (row === undefined) return input.errors.make('NOT_FOUND', { entity: input.entity })
	if (more.length > 0) return undecided(input, 'REREAD_UNREADABLE')
	const current = versionText(readField(row, input.field))
	if (current === undefined) return undecided(input, 'REREAD_UNREADABLE')
	if (current === String(input.expected)) return undecided(input, 'VERSION_UNCHANGED')
	const stale: IVersionGuardCode = input.field === 'version' ? 'STALE_VERSION' : 'STALE_REV'
	return input.errors.make(stale)
}
