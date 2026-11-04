import { parseInt8 } from '@lib/PostgreSQL/parse/parseInt8.mjs'
import { expect } from 'chai'

import { errorOf, reasonOf } from '../../../helpers/parseReason.mjs'

describe('parseInt8', () => {
	for (const text of ['0', '1', '-1', '10', '9007199254740991', '9007199254740993', '9223372036854775807', '-9223372036854775808']) {
		it(`returns ${text} unchanged`, () => {
			expect(parseInt8(text)).to.equal(text)
		})
	}

	const refused: [string, string][] = [
		['9223372036854775808', 'OUT_OF_RANGE'],
		['-9223372036854775809', 'OUT_OF_RANGE'],
		['99999999999999999999', 'OUT_OF_RANGE'],
		['', 'MALFORMED'],
		['-0', 'MALFORMED'],
		['01', 'MALFORMED'],
		['1.5', 'MALFORMED'],
		['1e3', 'MALFORMED'],
		[' 1', 'MALFORMED'],
		['1 ', 'MALFORMED'],
		['+1', 'MALFORMED'],
		['NaN', 'MALFORMED'],
		['-', 'MALFORMED']
	]
	for (const [text, reason] of refused) {
		it(`refuses ${JSON.stringify(text)} with ${reason}`, () => {
			expect(reasonOf(parseInt8, text)).to.equal(reason)
		})
	}

	it('names the type in the error', () => {
		expect(errorOf(parseInt8, 'x')?.typeName).to.equal('bigint')
		expect(errorOf(parseInt8, '9223372036854775808')?.typeName).to.equal('bigint')
	})
})
