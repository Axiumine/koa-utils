import type { IDbConnectReason } from './IDbConnectReason.mjs'

/** A short code that is safe to keep: letters, digits and underscore, at most 32 characters. */
const SAFE_CODE = /^\w{1,32}$/

/**
 * The typed error of a refused connection. It carries a closed reason and a fixed message, and no `cause`: the
 * platform error that led to it is not kept, because its text can quote the connection string and so the password.
 */
export class DbConnectError extends Error {
	readonly reason: IDbConnectReason
	/** The driver or SQLSTATE code (`ECONNREFUSED`, `28P01`), or undefined. Never free text. */
	readonly code: string | undefined

	constructor(reason: IDbConnectReason, code?: string) {
		super(`database connection refused: ${reason}`)
		this.name = 'DbConnectError'
		this.reason = reason
		this.code = code !== undefined && SAFE_CODE.test(code) ? code : undefined
	}
}
