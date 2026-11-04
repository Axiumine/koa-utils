/**
 * The closed reasons of a {@link DbClockError}, all defects of the calling code or of the configuration:
 *
 * - `WRITE_BEFORE_LOCK`: `now()` or `read()` in a transaction flagged as a write before a lock helper returned.
 * - `NOT_READ`: `now()` before the instant was read (a read-only transaction that did not await `read()`, or a clock
 *   created after the lock helpers ran).
 * - `ALREADY_BOUND`: a second clock for the same transaction.
 * - `SEAM_REFUSED`: the test seam was asked for where the caller said it is not allowed.
 * - `BAD_RESULT`: the statement answered no row, or a value that is not the text of an `int8`.
 * - `UNSAFE_INSTANT`: the instant is outside the range of integers a JavaScript number holds exactly.
 */
export const DB_CLOCK_REASONS = [
	'WRITE_BEFORE_LOCK',
	'NOT_READ',
	'ALREADY_BOUND',
	'SEAM_REFUSED',
	'BAD_RESULT',
	'UNSAFE_INSTANT'
] as const
