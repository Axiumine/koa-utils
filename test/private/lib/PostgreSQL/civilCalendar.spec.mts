import { civilFromDays, daysFromCivil, isCivilDate, MAX_YEAR, MIN_YEAR, pad } from '@private/lib/PostgreSQL/civilCalendar.mjs'
import { expect } from 'chai'

const MS_PER_DAY = 86_400_000

// Date only in test. Module under test never touch Date. setUTCFullYear → years 0..99 not mapped to 1900+
function daysSinceEpoch(year: number, month: number, day: number): number {
	const date = new Date(0)
	date.setUTCFullYear(year, month - 1, day)
	return date.getTime() / MS_PER_DAY
}

describe('civilCalendar', () => {
	it('year bounds are 1 and 9999', () => {
		expect(MIN_YEAR).to.equal(1)
		expect(MAX_YEAR).to.equal(9999)
	})

	describe('daysFromCivil', () => {
		it('epoch is day 0, neighbours are -1 and 1', () => {
			expect(daysFromCivil(1970, 1, 1)).to.equal(0)
			expect(daysFromCivil(1969, 12, 31)).to.equal(-1)
			expect(daysFromCivil(1970, 1, 2)).to.equal(1)
		})

		it('agrees with Date over every day of 0001..9999 sampled by month, incl. Jan/Feb (year shift) and leap days', () => {
			const years = [1, 4, 100, 399, 400, 1583, 1600, 1700, 1900, 1969, 1970, 2000, 2023, 2024, 2100, 9999]
			for (const year of years) {
				for (let month = 1; month <= 12; month += 1) {
					for (const day of [1, 15, 28]) {
						expect(daysFromCivil(year, month, day), `${year}-${month}-${day}`).to.equal(daysSinceEpoch(year, month, day))
					}
				}
			}
			expect(daysFromCivil(2024, 2, 29)).to.equal(daysSinceEpoch(2024, 2, 29))
			expect(daysFromCivil(2000, 2, 29)).to.equal(daysSinceEpoch(2000, 2, 29))
			expect(daysFromCivil(2024, 12, 31)).to.equal(daysSinceEpoch(2024, 12, 31))
		})

		it('year 0 and negative years follow the astronomical count', () => {
			expect(daysFromCivil(0, 1, 1)).to.equal(daysSinceEpoch(0, 1, 1))
			expect(daysFromCivil(-1, 3, 1)).to.equal(daysSinceEpoch(-1, 3, 1))
		})
	})

	describe('civilFromDays', () => {
		it('inverts daysFromCivil on every day of 1969..1971 and on sampled months of the whole range', () => {
			for (let days = daysFromCivil(1969, 1, 1); days <= daysFromCivil(1971, 12, 31); days += 1) {
				const civil = civilFromDays(days)
				expect(daysFromCivil(civil.year, civil.month, civil.day), String(days)).to.equal(days)
			}
			for (const year of [1, 4, 100, 400, 1900, 2000, 2024, 2100, 9999]) {
				for (let month = 1; month <= 12; month += 1) {
					for (const day of [1, 28]) {
						const days = daysFromCivil(year, month, day)
						expect(civilFromDays(days)).to.deep.equal({ year, month, day })
					}
				}
			}
		})

		it('gives exact fields at the edges', () => {
			expect(civilFromDays(0)).to.deep.equal({ year: 1970, month: 1, day: 1 })
			expect(civilFromDays(-1)).to.deep.equal({ year: 1969, month: 12, day: 31 })
			expect(civilFromDays(daysFromCivil(2024, 2, 29))).to.deep.equal({ year: 2024, month: 2, day: 29 })
			expect(civilFromDays(daysFromCivil(2024, 3, 1))).to.deep.equal({ year: 2024, month: 3, day: 1 })
			expect(civilFromDays(daysFromCivil(2023, 12, 31))).to.deep.equal({ year: 2023, month: 12, day: 31 })
			expect(civilFromDays(daysFromCivil(2023, 2, 28))).to.deep.equal({ year: 2023, month: 2, day: 28 })
			expect(civilFromDays(daysFromCivil(2023, 3, 1))).to.deep.equal({ year: 2023, month: 3, day: 1 })
			expect(civilFromDays(daysFromCivil(0, 12, 31))).to.deep.equal({ year: 0, month: 12, day: 31 })
		})

		it('gives exact fields on 29 February of every year divisible by 400, the last day of a 400-year cycle', () => {
			// Cycle end → day-of-era 146096 → only day where floor(dayOfEra / 146096) = 1. Term needed in year-of-era sum
			for (let year = 400; year <= 9600; year += 400) {
				expect(civilFromDays(daysFromCivil(year, 2, 28)), `${year}-02-28`).to.deep.equal({ year, month: 2, day: 28 })
				expect(civilFromDays(daysFromCivil(year, 2, 29)), `${year}-02-29`).to.deep.equal({ year, month: 2, day: 29 })
				expect(civilFromDays(daysFromCivil(year, 3, 1)), `${year}-03-01`).to.deep.equal({ year, month: 3, day: 1 })
			}
		})
	})

	describe('isCivilDate', () => {
		it('accepts the first and last day of every month', () => {
			const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
			lengths.forEach((length, index) => {
				expect(isCivilDate(2023, index + 1, 1), `1st of ${index + 1}`).to.equal(true)
				expect(isCivilDate(2023, index + 1, length), `last of ${index + 1}`).to.equal(true)
				expect(isCivilDate(2023, index + 1, length + 1), `after last of ${index + 1}`).to.equal(false)
			})
		})

		it('knows leap years: divisible by 4, not by 100 unless by 400', () => {
			expect(isCivilDate(2024, 2, 29)).to.equal(true)
			expect(isCivilDate(2000, 2, 29)).to.equal(true)
			expect(isCivilDate(2023, 2, 29)).to.equal(false)
			expect(isCivilDate(1900, 2, 29)).to.equal(false)
			expect(isCivilDate(2100, 2, 29)).to.equal(false)
			expect(isCivilDate(2024, 2, 30)).to.equal(false)
			// year 0 is leap (astronomical)
			expect(isCivilDate(0, 2, 29)).to.equal(true)
		})

		it('refuses a month outside 1 to 12 and a day below 1', () => {
			expect(isCivilDate(2024, 0, 10)).to.equal(false)
			expect(isCivilDate(2024, 13, 10)).to.equal(false)
			expect(isCivilDate(2024, 1, 0)).to.equal(false)
			expect(isCivilDate(2024, 1, -1)).to.equal(false)
			expect(isCivilDate(2024, -1, 1)).to.equal(false)
		})
	})

	describe('pad', () => {
		it('left-pads with zeros to the width, never truncates', () => {
			expect(pad(5, 2)).to.equal('05')
			expect(pad(0, 3)).to.equal('000')
			expect(pad(123, 2)).to.equal('123')
			expect(pad(1, 1)).to.equal('1')
			expect(pad(12, 4)).to.equal('0012')
		})
	})
})
