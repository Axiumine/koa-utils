import { DbParseError } from '@lib/PostgreSQL/error/DbParseError.mjs'
import type { IStringParser } from '@lib/PostgreSQL/parse/IStringParser.mjs'

// eslint-disable-next-line security/detect-unsafe-regex -- the only nested quantifier is the bounded {1,6} fraction inside an optional group, input is one short text
const TIME_TEXT = /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/
const TYPE_NAME = 'time without time zone'

/**
 * `time`: `HH:mm`. The text must have zero seconds and no fraction of a second; a value with any of them is refused
 * with `TIME_HAS_SECONDS`, not rounded or cut, because a silent cut would turn two different stored values into one.
 * `24:00:00`, which PostgreSQL accepts, is `OUT_OF_RANGE`.
 */
export const parseTime: IStringParser = (text) => {
	const match = TIME_TEXT.exec(text)
	if (match === null) throw new DbParseError('MALFORMED', TYPE_NAME)
	const hour = Number(match[1])
	if (hour > 24 || Number(match[2]) > 59 || Number(match[3]) > 59) throw new DbParseError('MALFORMED', TYPE_NAME)
	if (Number(match[3]) !== 0 || (match[4] !== undefined && /[1-9]/.test(match[4]))) {
		throw new DbParseError('TIME_HAS_SECONDS', TYPE_NAME)
	}
	if (hour === 24) throw new DbParseError('OUT_OF_RANGE', TYPE_NAME)
	return text.slice(0, 5)
}
