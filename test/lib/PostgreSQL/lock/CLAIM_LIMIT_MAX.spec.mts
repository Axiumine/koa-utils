import { CLAIM_LIMIT_MAX } from '@lib/PostgreSQL/lock/CLAIM_LIMIT_MAX.mjs'
import { expect } from 'chai'

describe('CLAIM_LIMIT_MAX', () => {
	it('is 1000: the most rows one claim takes', () => {
		expect(CLAIM_LIMIT_MAX).to.equal(1000)
	})
})
