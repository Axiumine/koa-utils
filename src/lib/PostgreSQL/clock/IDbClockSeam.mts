/**
 * A replacement for the clock statement, for a test build. The statement must answer the same shape as `CLOCK_SQL`: one
 * row, one `bigint` column `ms`, and it takes no parameter. `allowed` is computed by the caller from its own environment
 * and must be exactly `true`; anything else, a missing value included, refuses the seam with `DbClockError`
 * `SEAM_REFUSED`, so a forgotten flag fails closed. The kit reads no environment variable itself.
 */
export interface IDbClockSeam {
	readonly statement: string
	readonly allowed: boolean
}
