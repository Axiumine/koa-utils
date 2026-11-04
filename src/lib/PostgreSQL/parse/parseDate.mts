import { DbParseError } from '@lib/PostgreSQL/error/DbParseError.mjs'
import type { IStringParser } from '@lib/PostgreSQL/parse/IStringParser.mjs'
import { isCivilDate, MIN_YEAR } from '@private/lib/PostgreSQL/civilCalendar.mjs'

const DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * `date`: `YYYY-MM-DD`, years 0001 to 9999, checked against the calendar, returned unchanged. Under `DateStyle` ISO (the
 * default) this is what the server prints. `infinity`, a BC date, a year of five digits and any other style are
 * `MALFORMED`; a day that does not exist and year 0000 are `OUT_OF_RANGE`. No `Date` is built.
 */
export const parseDate: IStringParser = (text) => {
	const match = DATE_TEXT.exec(text)
	if (match === null) throw new DbParseError('MALFORMED', 'date')
	const year = Number(match[1])
	if (year < MIN_YEAR || !isCivilDate(year, Number(match[2]), Number(match[3]))) {
		throw new DbParseError('OUT_OF_RANGE', 'date')
	}
	return text
}
