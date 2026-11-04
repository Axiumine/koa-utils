import { DbClockError } from '@lib/PostgreSQL/error/DbClockError.mjs'
import { parseInt8 } from '@lib/PostgreSQL/parse/parseInt8.mjs'

/** The rows the clock statement answers: one row, one text column `ms`. */
interface IClockRow {
	readonly ms?: unknown
}

/**
 * The instant in epoch milliseconds, from the rows of the clock statement. The one row must hold the text of a `bigint`:
 * it goes through the `int8` rule (`parseInt8`: shape and 64-bit range), then through a safe-integer check, and only then
 * becomes a JavaScript number. Anything else is `DbClockError` `BAD_RESULT` or `UNSAFE_INSTANT`.
 */
export function clockInstant(rows: readonly IClockRow[]): number {
	const value = rows[0]?.ms
	if (rows.length !== 1 || typeof value !== 'string') throw new DbClockError('BAD_RESULT')
	const milliseconds = BigInt(parseInt8(value))
	if (milliseconds > BigInt(Number.MAX_SAFE_INTEGER) || milliseconds < BigInt(Number.MIN_SAFE_INTEGER)) {
		throw new DbClockError('UNSAFE_INSTANT')
	}
	return Number(milliseconds)
}
