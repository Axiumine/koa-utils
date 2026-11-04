import { DbClockError } from '@lib/PostgreSQL/error/DbClockError.mjs'
import { DbParseError } from '@lib/PostgreSQL/error/DbParseError.mjs'
import { clockInstant } from '@private/lib/PostgreSQL/clockInstant.mjs'
import { expect } from 'chai'

import { thrownBy } from '../../../helpers/recordingTx.mjs'

describe('clockInstant', () => {
	it('turns the one row with the text of a bigint into a number', () => {
		expect(clockInstant([{ ms: '1700000000123' }])).to.equal(1700000000123)
		expect(clockInstant([{ ms: '-5' }])).to.equal(-5)
		expect(clockInstant([{ ms: '0' }])).to.equal(0)
	})

	it('accepts the edges of the safe integers and refuses one step beyond, on both sides', () => {
		expect(clockInstant([{ ms: '9007199254740991' }])).to.equal(Number.MAX_SAFE_INTEGER)
		expect(clockInstant([{ ms: '-9007199254740991' }])).to.equal(Number.MIN_SAFE_INTEGER)
		expect(thrownBy(() => clockInstant([{ ms: '9007199254740992' }]))).to.deep.include({ reason: 'UNSAFE_INSTANT' })
		expect(thrownBy(() => clockInstant([{ ms: '-9007199254740992' }]))).to.deep.include({ reason: 'UNSAFE_INSTANT' })
	})

	it('refuses anything but exactly one row with a text ms as BAD_RESULT', () => {
		for (const rows of [[], [{ ms: '1' }, { ms: '2' }], [{ ms: 1 }], [{ ms: null }], [{}]]) {
			const error = thrownBy(() => clockInstant(rows))
			expect(error).to.be.instanceOf(DbClockError)
			expect(error).to.deep.include({ reason: 'BAD_RESULT' })
		}
	})

	it('lets the int8 rule refuse a text that is not a bigint, with its own error', () => {
		expect(thrownBy(() => clockInstant([{ ms: '1.5' }]))).to.be.instanceOf(DbParseError)
		expect(thrownBy(() => clockInstant([{ ms: '9223372036854775808' }]))).to.deep.include({ reason: 'OUT_OF_RANGE' })
	})
})
