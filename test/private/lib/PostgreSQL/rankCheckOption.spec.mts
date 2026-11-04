import { rankCheckOption } from '@private/lib/PostgreSQL/rankCheckOption.mjs'
import { expect } from 'chai'

import { thrownBy } from '../../../helpers/recordingTx.mjs'

describe('rankCheckOption', () => {
	it('answers a boolean as it is and a missing value as undefined', () => {
		expect(rankCheckOption(true)).to.equal(true)
		expect(rankCheckOption(false)).to.equal(false)
		expect(rankCheckOption(undefined)).to.equal(undefined)
	})

	it('refuses everything else with a TypeError, falsy values too', () => {
		for (const value of ['yes', 1, 0, null, '', {}, []]) {
			const error = thrownBy(() => rankCheckOption(value))
			expect(error).to.be.instanceOf(TypeError)
			expect(error).to.have.property('message', 'rankCheck must be a boolean')
		}
	})
})
