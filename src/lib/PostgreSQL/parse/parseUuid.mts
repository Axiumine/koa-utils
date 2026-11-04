import { DbParseError } from '@lib/PostgreSQL/error/DbParseError.mjs'
import type { IStringParser } from '@lib/PostgreSQL/parse/IStringParser.mjs'

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** `uuid`: the lower case text the server prints, checked and returned unchanged. Used for the elements of `uuid[]`. */
export const parseUuid: IStringParser = (text) => {
	if (!UUID_TEXT.test(text)) throw new DbParseError('MALFORMED', 'uuid')
	return text
}
