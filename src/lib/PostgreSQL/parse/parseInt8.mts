import { DbParseError } from '@lib/PostgreSQL/error/DbParseError.mjs'
import type { IStringParser } from '@lib/PostgreSQL/parse/IStringParser.mjs'

const INT8_TEXT = /^(?:0|-?[1-9]\d*)$/
const INT8_MIN = -(2n ** 63n)
const INT8_MAX = 2n ** 63n - 1n

/**
 * `int8`: the decimal string, unchanged, after a check of the shape and of the 64-bit range. It stays a string because
 * a JavaScript number holds integers exactly only up to 2^53 - 1.
 */
export const parseInt8: IStringParser = (text) => {
	if (!INT8_TEXT.test(text)) throw new DbParseError('MALFORMED', 'bigint')
	const value = BigInt(text)
	if (value < INT8_MIN || value > INT8_MAX) throw new DbParseError('OUT_OF_RANGE', 'bigint')
	return text
}
