import { DbParseError } from '@lib/PostgreSQL/error/DbParseError.mjs'
import type { IDbParseReason } from '@lib/PostgreSQL/error/IDbParseReason.mjs'

// reason of the DbParseError a parser throws, 'no error' when it returns. Any other throw → rethrow (spec fail)
export function reasonOf(parse: (text: string) => unknown, text: string): IDbParseReason | 'no error' {
	try {
		parse(text)
		return 'no error'
	} catch (error) {
		if (!(error instanceof DbParseError)) throw error
		return error.reason
	}
}

// the DbParseError itself, undefined when parser returns. Lets spec read typeName too
export function errorOf(parse: (text: string) => unknown, text: string): DbParseError | undefined {
	try {
		parse(text)
		return undefined
	} catch (error) {
		if (!(error instanceof DbParseError)) throw error
		return error
	}
}
