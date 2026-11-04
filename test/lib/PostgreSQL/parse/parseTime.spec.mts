import { parseTime } from '@lib/PostgreSQL/parse/parseTime.mjs'
import { expect } from 'chai'

import { errorOf, reasonOf } from '../../../helpers/parseReason.mjs'

describe('parseTime', () => {
	const accepted: [string, string][] = [
		['00:00:00', '00:00'],
		['09:05:00', '09:05'],
		['14:30:00', '14:30'],
		['23:59:00', '23:59'],
		['14:30:00.000000', '14:30'],
		['14:30:00.0', '14:30']
	]
	for (const [text, expected] of accepted) {
		it(`reads ${text} as ${expected}`, () => {
			expect(parseTime(text)).to.equal(expected)
		})
	}

	for (const text of ['14:30:01', '14:30:59', '14:30:00.5', '14:30:00.000001', '14:30:00.999999', '00:00:30.25', '14:30:00.010']) {
		it(`refuses ${text} with TIME_HAS_SECONDS`, () => {
			expect(reasonOf(parseTime, text)).to.equal('TIME_HAS_SECONDS')
		})
	}

	const refused: [string, string][] = [
		['24:00:00', 'OUT_OF_RANGE'],
		['24:00:00.000000', 'OUT_OF_RANGE'],
		['25:00:00', 'MALFORMED'],
		['14:60:00', 'MALFORMED'],
		['14:30:60', 'MALFORMED'],
		['14:30', 'MALFORMED'],
		['14:30:00+01', 'MALFORMED'],
		['2:30:00', 'MALFORMED'],
		['14:30:00.1234567', 'MALFORMED'],
		['14:30:00.', 'MALFORMED'],
		[' 14:30:00', 'MALFORMED'],
		['14:30:00 ', 'MALFORMED'],
		['', 'MALFORMED']
	]
	for (const [text, reason] of refused) {
		it(`refuses ${JSON.stringify(text)} with ${reason}`, () => {
			expect(reasonOf(parseTime, text)).to.equal(reason)
		})
	}

	it('puts a value with seconds before the range check that 24:00:00 would trip', () => {
		expect(reasonOf(parseTime, '24:00:01')).to.equal('TIME_HAS_SECONDS')
		expect(reasonOf(parseTime, '24:00:00.5')).to.equal('TIME_HAS_SECONDS')
	})

	it('puts a field out of range before the seconds rule', () => {
		// minute 60 + seconds → MALFORMED not TIME_HAS_SECONDS
		expect(reasonOf(parseTime, '14:60:30')).to.equal('MALFORMED')
		expect(reasonOf(parseTime, '25:00:30')).to.equal('MALFORMED')
	})

	it('names the type in the error', () => {
		for (const text of ['x', '25:00:00', '14:30:01', '24:00:00']) {
			expect(errorOf(parseTime, text)?.typeName, text).to.equal('time without time zone')
		}
	})
})
