import type { IDbParseReason } from './IDbParseReason.mjs'

/**
 * The typed error of the string parsers. It carries a closed reason and a fixed message built from the reason and the
 * name of the type, never from the value, so no stored value can reach a log line through it. It has no `cause`.
 */
export class DbParseError extends Error {
	readonly reason: IDbParseReason
	/** The name of the type as `format_type` prints it (`date`, `time without time zone`, ...). */
	readonly typeName: string

	constructor(reason: IDbParseReason, typeName: string) {
		super(`database value of type ${typeName} cannot be read: ${reason}`)
		this.name = 'DbParseError'
		this.reason = reason
		this.typeName = typeName
	}
}
