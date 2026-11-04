import { parseDate } from '@lib/PostgreSQL/parse/parseDate.mjs'
import { expect } from 'chai'

import { errorOf, reasonOf } from '../../../helpers/parseReason.mjs'

describe('parseDate', () => {
	for (const text of ['2024-03-10', '0001-01-01', '9999-12-31', '2024-02-29', '2000-02-29', '1999-12-31', '2024-12-31', '2024-01-01']) {
		it(`accepts ${text} and returns it unchanged`, () => {
			expect(parseDate(text)).to.equal(text)
		})
	}

	const refused: [string, string][] = [
		['infinity', 'MALFORMED'],
		['-infinity', 'MALFORMED'],
		['0044-03-15 BC', 'MALFORMED'],
		['10000-01-01', 'MALFORMED'],
		['03/10/2024', 'MALFORMED'],
		['2024-3-10', 'MALFORMED'],
		['2024-03-10 ', 'MALFORMED'],
		[' 2024-03-10', 'MALFORMED'],
		['2024-03-10\n', 'MALFORMED'],
		['', 'MALFORMED'],
		['2024-13-01', 'OUT_OF_RANGE'],
		['2024-00-10', 'OUT_OF_RANGE'],
		['2024-04-31', 'OUT_OF_RANGE'],
		['2023-02-29', 'OUT_OF_RANGE'],
		['1900-02-29', 'OUT_OF_RANGE'],
		['2024-01-00', 'OUT_OF_RANGE'],
		['2024-01-32', 'OUT_OF_RANGE'],
		['0000-01-01', 'OUT_OF_RANGE']
	]
	for (const [text, reason] of refused) {
		it(`refuses ${JSON.stringify(text)} with ${reason}`, () => {
			expect(reasonOf(parseDate, text)).to.equal(reason)
		})
	}

	it('names the type in the error', () => {
		expect(errorOf(parseDate, 'x')?.typeName).to.equal('date')
		expect(errorOf(parseDate, '2023-02-29')?.typeName).to.equal('date')
	})
})
