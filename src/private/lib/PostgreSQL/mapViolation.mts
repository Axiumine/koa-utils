import { constraintNameOf } from '@lib/PostgreSQL/error/constraintNameOf.mjs'
import type { IMapDbErrorOptions } from '@lib/PostgreSQL/error/IMapDbErrorOptions.mjs'
import { lookupConstraint } from '@lib/PostgreSQL/error/lookupConstraint.mjs'

import { constraintDetails } from './constraintDetails.mjs'
import { constraintField } from './constraintField.mjs'
import { internalFailure } from './internalFailure.mjs'

/** A violation of SQLSTATE 23505, 23514 or 23503: the row of the table built into an error, or the internal error. */
export function mapViolation<TError extends Error>(
	error: unknown,
	sqlstate: string,
	options: IMapDbErrorOptions<TError>
): TError {
	const name = constraintNameOf(error)
	const entry = name === undefined ? undefined : lookupConstraint(options.table, name)
	const fields = { sqlstate, ...constraintField(name) }
	if (entry === undefined) {
		return internalFailure(
			options,
			'db_constraint_unmapped_total',
			'database constraint violation is not in the constraint map',
			{
				reason: 'CONSTRAINT_UNMAPPED',
				...fields
			}
		)
	}
	if (entry.code === (options.internalCode ?? 'INTERNAL')) {
		return internalFailure(options, 'db_error_internal_total', 'database constraint violation is a defect', {
			reason: 'CONSTRAINT_INTERNAL',
			...fields
		})
	}
	const details = constraintDetails(entry, options.details)
	if (details === null) {
		return internalFailure(
			options,
			'db_error_internal_total',
			'database constraint violation needs details that the caller did not supply',
			{
				reason: 'DETAILS_NOT_SUPPLIED',
				...fields
			}
		)
	}
	return details === undefined ? options.errors.make(entry.code) : options.errors.make(entry.code, details)
}
