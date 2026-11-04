import { uuidsOf } from '@lib/PostgreSQL/lock/uuidsOf.mjs'
import { expect } from 'chai'

import { thrownBy } from '../../../helpers/recordingTx.mjs'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'

describe('uuidsOf', () => {
	it('answers the ids in lower case, ascending, without duplicates', () => {
		expect(uuidsOf([C, B, A.toUpperCase(), B, A], 'rowIds')).to.deep.equal([A, B, C])
	})

	it('answers an empty list for an empty list', () => {
		expect(uuidsOf([], 'rowIds')).to.deep.equal([])
	})

	it('answers a new array and leaves the input alone', () => {
		const input = [B, A]
		const out = uuidsOf(input, 'rowIds')
		expect(out).to.not.equal(input)
		expect(input).to.deep.equal([B, A])
	})

	it('refuses what is not an array, naming the argument', () => {
		for (const value of [undefined, null, A, 1, {}, new Set([A])]) {
			const error = thrownBy(() => uuidsOf(value, 'rowIds'))
			expect(error).to.be.instanceOf(TypeError)
			expect(error).to.have.property('message', 'rowIds must be an array of UUIDs')
		}
	})

	it('refuses an entry that is not a uuid, naming the argument and quoting nothing', () => {
		for (const entry of ['planted-secret-value-1234', undefined, null, 1, '']) {
			const error = thrownBy(() => uuidsOf([A, entry], 'rowIds'))
			expect(error).to.be.instanceOf(TypeError)
			expect(error).to.have.property('message', 'each entry of rowIds must be a UUID')
		}
	})
})
