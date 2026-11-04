import { parseTimestamptz } from '@lib/PostgreSQL/parse/parseTimestamptz.mjs'
import { expect } from 'chai'

import { errorOf, reasonOf } from '../../../helpers/parseReason.mjs'

describe('parseTimestamptz', () => {
	const accepted: [string, string][] = [
		// same instant printed in three session zones
		['2024-03-10 10:30:00+00', '2024-03-10T10:30:00.000Z'],
		['2024-03-10 03:30:00-07', '2024-03-10T10:30:00.000Z'],
		['2024-03-10 19:30:00+09', '2024-03-10T10:30:00.000Z'],
		// offset with minutes, offset with seconds (local mean time before 1884)
		['2024-03-10 16:00:00+05:30', '2024-03-10T10:30:00.000Z'],
		['1850-06-15 04:07:02-07:52:58', '1850-06-15T12:00:00.000Z'],
		['1883-11-18 11:52:58-07:52:58', '1883-11-18T19:45:56.000Z'],
		// upper edge of offset minutes + seconds → boundary 59 accepted
		['2024-03-10 10:30:00+00:59', '2024-03-10T09:31:00.000Z'],
		['2024-03-10 10:30:00+00:00:59', '2024-03-10T10:29:01.000Z'],
		// fraction: ms kept, µs cut
		['2024-03-10 10:30:00.1+00', '2024-03-10T10:30:00.100Z'],
		['2024-03-10 10:30:00.12+00', '2024-03-10T10:30:00.120Z'],
		['2024-03-10 10:30:00.123+00', '2024-03-10T10:30:00.123Z'],
		['2024-03-10 10:30:00.123456+00', '2024-03-10T10:30:00.123Z'],
		['2024-03-10 10:30:00.999999+00', '2024-03-10T10:30:00.999Z'],
		['2024-03-10 10:30:00.000999+00', '2024-03-10T10:30:00.000Z'],
		['2024-03-10 23:59:59.999999+00', '2024-03-10T23:59:59.999Z'],
		// epoch + both sides
		['1970-01-01 00:00:00+00', '1970-01-01T00:00:00.000Z'],
		['1970-01-01 00:00:00.0005+00', '1970-01-01T00:00:00.000Z'],
		['1969-12-31 23:59:59+00', '1969-12-31T23:59:59.000Z'],
		['1969-12-31 23:59:59.999+00', '1969-12-31T23:59:59.999Z'],
		// before 1970 cut = toward zero = later in time
		['1969-12-31 23:59:59.999999+00', '1970-01-01T00:00:00.000Z'],
		['1969-12-31 23:59:59.9995+00', '1970-01-01T00:00:00.000Z'],
		['1969-12-31 23:59:59.9985+00', '1969-12-31T23:59:59.999Z'],
		['1969-12-31 23:59:59.0005+00', '1969-12-31T23:59:59.001Z'],
		['1960-06-15 12:00:00.123456+00', '1960-06-15T12:00:00.124Z'],
		['1960-06-15 12:00:00.123000+00', '1960-06-15T12:00:00.123Z'],
		// negative whole ms (no µs below ms) must not get the +1
		['1960-06-15 12:00:00.123+00', '1960-06-15T12:00:00.123Z'],
		// ends of supported years
		['0001-01-01 00:00:00+00', '0001-01-01T00:00:00.000Z'],
		['9999-12-31 23:59:59.999999+00', '9999-12-31T23:59:59.999Z'],
		// zone that prints another year than the instant has
		['10000-01-01 08:59:59+09', '9999-12-31T23:59:59.000Z'],
		['0001-12-31 16:07:02-07:52:58 BC', '0001-01-01T00:00:00.000Z'],
		// leap day, month end, year end
		['2024-02-29 12:00:00+00', '2024-02-29T12:00:00.000Z'],
		['2023-12-31 23:00:00-01', '2024-01-01T00:00:00.000Z'],
		// last allowed field values
		['2024-03-10 23:59:59+00', '2024-03-10T23:59:59.000Z'],
		['2024-12-31 00:00:00+00', '2024-12-31T00:00:00.000Z'],
		// single-digit parts padded on output
		['0005-03-04 01:02:03.004+00', '0005-03-04T01:02:03.004Z']
	]
	for (const [text, expected] of accepted) {
		it(`reads ${text} as ${expected}`, () => {
			expect(parseTimestamptz(text)).to.equal(expected)
		})
	}

	const refused: [string, string][] = [
		['infinity', 'MALFORMED'],
		['-infinity', 'MALFORMED'],
		['2024-03-10 10:30:00', 'MALFORMED'],
		['2024-03-10T10:30:00Z', 'MALFORMED'],
		['2024-03-10 10:30:00+00:00:00:00', 'MALFORMED'],
		['2024-03-10 10:30:00.1234567+00', 'MALFORMED'],
		['2024-02-30 10:30:00+00', 'MALFORMED'],
		['2024-03-10 24:00:00+00', 'MALFORMED'],
		['2024-03-10 10:60:00+00', 'MALFORMED'],
		['2024-03-10 10:30:60+00', 'MALFORMED'],
		['2024-03-10 10:30:00+05:60', 'MALFORMED'],
		['2024-03-10 10:30:00+05:30:60', 'MALFORMED'],
		['Mar 10 10:30:00 2024 UTC', 'MALFORMED'],
		[' 2024-03-10 10:30:00+00', 'MALFORMED'],
		['2024-03-10 10:30:00+00 ', 'MALFORMED'],
		['2024-03-10 10:30:00+00 BC ', 'MALFORMED'],
		['', 'MALFORMED'],
		// valid text, instant outside 1..9999
		['0001-01-01 00:00:00+01', 'OUT_OF_RANGE'],
		['9999-12-31 23:00:00-01', 'OUT_OF_RANGE'],
		['0044-03-15 12:00:00+00 BC', 'OUT_OF_RANGE']
	]
	for (const [text, reason] of refused) {
		it(`refuses ${JSON.stringify(text)} with ${reason}`, () => {
			expect(reasonOf(parseTimestamptz, text)).to.equal(reason)
		})
	}

	it('gives the same string for one instant printed in any zone', () => {
		const printed = [
			'2026-11-02 21:30:15.123456+00',
			'2026-11-02 13:30:15.123456-08',
			'2026-11-03 06:30:15.123456+09',
			'2026-11-03 03:00:15.123456+05:30',
			'2026-11-03 02:15:15.123456+04:45'
		]
		expect([...new Set(printed.map(parseTimestamptz))]).to.deep.equal(['2026-11-02T21:30:15.123Z'])
	})

	it('names the type in the error', () => {
		for (const text of ['x', '2024-02-30 10:30:00+00', '9999-12-31 23:00:00-01']) {
			expect(errorOf(parseTimestamptz, text)?.typeName, text).to.equal('timestamp with time zone')
		}
	})
})
