import { CLOCK_SQL } from '@lib/PostgreSQL/clock/CLOCK_SQL.mjs'
import { DbClockError } from '@lib/PostgreSQL/error/DbClockError.mjs'

/** The fields of a seam as an untyped caller may have given them. */
interface ILooseSeam {
	readonly statement?: unknown
	readonly allowed?: unknown
}

/**
 * The statement a clock runs. No seam: `CLOCK_SQL`. A seam is checked in this order: it is an object, its statement is a
 * non-empty text, its `allowed` is a boolean, and `allowed` is true. A seam that is not allowed is `DbClockError`
 * `SEAM_REFUSED`, before anything touches the transaction. A `TypeError` for a seam out of its type.
 */
export function clockStatement(seam: unknown): string {
	if (seam === undefined) return CLOCK_SQL
	if (typeof seam !== 'object' || seam === null) throw new TypeError('seam must be an object')
	const { statement, allowed } = seam as ILooseSeam
	if (typeof statement !== 'string' || statement === '') throw new TypeError('seam.statement must be a non-empty string')
	if (typeof allowed !== 'boolean') throw new TypeError('seam.allowed must be a boolean')
	if (!allowed) throw new DbClockError('SEAM_REFUSED')
	return statement
}
