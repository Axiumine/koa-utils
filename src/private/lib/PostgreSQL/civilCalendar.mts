import type { ICivilDate } from './ICivilDate.mjs'

// The proleptic Gregorian calendar, in whole days since 1970-01-01. These are the two algorithms of Howard Hinnant,
// "chrono-Compatible Low-Level Date Algorithms" (public domain), which PostgreSQL's own calendar agrees with. The
// unit tests check them against `Date.UTC` over a wide range, in the tests only: this module never touches `Date`.

/** The first year the parsers return. */
export const MIN_YEAR = 1

/** The last year the parsers return. */
export const MAX_YEAR = 9999

/** Days since 1970-01-01 of the civil date; `month` is 1 to 12, `year` is astronomical (1 BC is 0). */
export function daysFromCivil(year: number, month: number, day: number): number {
	const y = month <= 2 ? year - 1 : year
	const era = Math.floor(y / 400)
	const yearOfEra = y - era * 400
	const dayOfYear = Math.floor((153 * ((month + 9) % 12) + 2) / 5) + day - 1
	const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear
	return era * 146097 + dayOfEra - 719468
}

/** The civil date of a count of days since 1970-01-01. */
export function civilFromDays(days: number): ICivilDate {
	const z = days + 719468
	const era = Math.floor(z / 146097)
	const dayOfEra = z - era * 146097
	const yearOfEra = Math.floor(
		(dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365
	)
	const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
	const monthIndex = Math.floor((5 * dayOfYear + 2) / 153)
	const day = dayOfYear - Math.floor((153 * monthIndex + 2) / 5) + 1
	const month = monthIndex < 10 ? monthIndex + 3 : monthIndex - 9
	const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0)
	return { year, month, day }
}

const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0

// Months 4, 6, 9 and 11 have 30 days, February 28 or 29, the rest 31. Computed, not looked up, so there is no
// indexed read that could be undefined.
function daysInMonth(year: number, month: number): number {
	if (month === 2) return isLeapYear(year) ? 29 : 28
	return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

/** True for a real day of a real month of the proleptic Gregorian calendar. */
export function isCivilDate(year: number, month: number, day: number): boolean {
	if (month < 1 || month > 12 || day < 1) return false
	return day <= daysInMonth(year, month)
}

/** `value` as a decimal string, left-padded with zeros to `width`. */
export function pad(value: number, width: number): string {
	return String(value).padStart(width, '0')
}
