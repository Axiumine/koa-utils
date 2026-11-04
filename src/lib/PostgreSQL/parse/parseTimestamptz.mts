import { DbParseError } from '@lib/PostgreSQL/error/DbParseError.mjs'
import type { IStringParser } from '@lib/PostgreSQL/parse/IStringParser.mjs'
import { civilFromDays, daysFromCivil, isCivilDate, MAX_YEAR, MIN_YEAR, pad } from '@private/lib/PostgreSQL/civilCalendar.mjs'

// year (four to six digits: a session zone ahead of UTC prints 10000-01-01 for the last hours of 9999), date, time,
// fraction, offset (hours, optional minutes, optional seconds), optional ` BC`.
const TIMESTAMPTZ_TEXT =
	// eslint-disable-next-line security/detect-unsafe-regex -- nested quantifiers are all bounded ({1,6}, {4,6}) inside optional groups, input is one short text
	/^(\d{4,6})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?([+-])(\d{2})(?::(\d{2})(?::(\d{2}))?)?( BC)?$/

const TYPE_NAME = 'timestamp with time zone'
const SECONDS_PER_DAY = 86400
const MS_PER_DAY = 86_400_000

interface IParts {
	readonly year: number
	readonly month: number
	readonly day: number
	readonly hour: number
	readonly minute: number
	readonly second: number
	readonly microseconds: number
	readonly offsetSign: 1 | -1
	readonly offsetHours: number
	readonly offsetMinutes: number
	readonly offsetSeconds: number
}

const malformed = (): DbParseError => new DbParseError('MALFORMED', TYPE_NAME)

function readParts(match: RegExpExecArray): IParts {
	return {
		// A BC year prints as its count of years before 1 AD; the astronomical year is one less than minus it.
		year: match[12] === undefined ? Number(match[1]) : 1 - Number(match[1]),
		month: Number(match[2]),
		day: Number(match[3]),
		hour: Number(match[4]),
		minute: Number(match[5]),
		second: Number(match[6]),
		microseconds: Number((match[7] ?? '').padEnd(6, '0')),
		offsetSign: match[8] === '-' ? -1 : 1,
		offsetHours: Number(match[9]),
		offsetMinutes: Number(match[10] ?? 0),
		offsetSeconds: Number(match[11] ?? 0)
	}
}

// Every field against its range; the offset hours are not bounded here, the offset is whatever the server printed.
const isReadable = (p: IParts): boolean =>
	isCivilDate(p.year, p.month, p.day) &&
	p.hour <= 23 &&
	p.minute <= 59 &&
	p.second <= 59 &&
	p.offsetMinutes <= 59 &&
	p.offsetSeconds <= 59

// Epoch milliseconds, the part below a millisecond cut off toward zero (see parseTimestamptz).
function epochMsOf(p: IParts): number {
	const offset = p.offsetSign * (p.offsetHours * 3600 + p.offsetMinutes * 60 + p.offsetSeconds)
	const localSeconds = daysFromCivil(p.year, p.month, p.day) * SECONDS_PER_DAY + p.hour * 3600 + p.minute * 60 + p.second
	const wholeMs = (localSeconds - offset) * 1000 + Math.floor(p.microseconds / 1000)
	// The part below a millisecond is positive, so the exact value is wholeMs plus a fraction: toward zero is wholeMs when
	// that is not negative, and one later when it is.
	return wholeMs < 0 && p.microseconds % 1000 > 0 ? wholeMs + 1 : wholeMs
}

function isoOf(epochMs: number): string {
	const days = Math.floor(epochMs / MS_PER_DAY)
	const civil = civilFromDays(days)
	if (civil.year < MIN_YEAR || civil.year > MAX_YEAR) throw new DbParseError('OUT_OF_RANGE', TYPE_NAME)
	const msOfDay = epochMs - days * MS_PER_DAY
	const secondOfDay = Math.floor(msOfDay / 1000)
	return (
		`${pad(civil.year, 4)}-${pad(civil.month, 2)}-${pad(civil.day, 2)}` +
		`T${pad(Math.floor(secondOfDay / 3600), 2)}:${pad(Math.floor((secondOfDay % 3600) / 60), 2)}` +
		`:${pad(secondOfDay % 60, 2)}.${pad(msOfDay % 1000, 3)}Z`
	)
}

/**
 * `timestamptz`: `YYYY-MM-DDTHH:mm:ss.SSSZ`, the instant in UTC.
 *
 * The server prints the instant in the offset of the SESSION zone (`+00`, `-08`, `+05:30`, and for old dates with
 * seconds, `-07:52:58`). The parser reads the offset and converts, so a session in another zone gives the same string.
 *
 * The part of a millisecond that the text carries (microseconds) is cut off toward zero on the line of epoch
 * milliseconds, which is what a JavaScript time value does with a fraction (`TimeClip`). Not rounded: `.999999` of a
 * second is `.999`. For an instant from 1970 on, that is the same as cutting the digits. For an instant before 1970 the
 * epoch value is negative, and toward zero is later in time: the instant `1969-12-31 23:59:59.999999` (epoch minus one
 * microsecond) becomes `1970-01-01T00:00:00.000Z`, and `23:59:59.9985` (epoch minus 1.5 ms) becomes `23:59:59.999`.
 *
 * A text in another shape (another `DateStyle`, `infinity`, a field out of range) is `MALFORMED`. A valid text whose
 * UTC year is outside 1 to 9999 is `OUT_OF_RANGE`. No `Date` is built.
 */
export const parseTimestamptz: IStringParser = (text) => {
	const match = TIMESTAMPTZ_TEXT.exec(text)
	if (match === null) throw malformed()
	const parts = readParts(match)
	if (!isReadable(parts)) throw malformed()
	return isoOf(epochMsOf(parts))
}
