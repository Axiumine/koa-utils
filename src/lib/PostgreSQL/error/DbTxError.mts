import type { IDbTxReason } from './IDbTxReason.mjs'

/** The typed error of a misused transaction. It carries a closed reason and a fixed message, and no `cause`. */
export class DbTxError extends Error {
	readonly reason: IDbTxReason

	constructor(reason: IDbTxReason) {
		super(`database transaction misused: ${reason}`)
		this.name = 'DbTxError'
		this.reason = reason
	}
}
