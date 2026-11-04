import type { IDbStateReason } from './IDbStateReason.mjs'

/**
 * The error of a second copy of this package that cannot share its state with the first. It is thrown when a module that
 * keeps per-transaction state is loaded, so a mismatch stops the process at start and never splits the state silently.
 * The message is fixed and holds no value.
 */
export class DbStateError extends Error {
	readonly reason: IDbStateReason

	constructor(reason: IDbStateReason) {
		super(`shared state of the PostgreSQL kit refused: ${reason}: keep one version of @axiumine/koa-utils installed`)
		this.name = 'DbStateError'
		this.reason = reason
	}
}
