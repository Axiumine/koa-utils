/** What `claimRowsSkipLocked` takes: two names from the closed lists and a bound on the rows. */
export interface IClaimRequest {
	readonly table: string
	readonly predicate: string
	/** A whole number from 1 to `CLAIM_LIMIT_MAX`. */
	readonly limit: number
}
