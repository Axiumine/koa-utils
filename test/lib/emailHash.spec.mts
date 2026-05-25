import { EMAIL_HASH_LEN } from '@lib/Constants.mjs'
import { emailHash } from '@lib/emailHash.mjs'
import { expect } from 'chai'

describe('emailHash', () => {
	it('returns string of EMAIL_HASH_LEN chars', () => {
		expect(emailHash()).to.have.lengthOf(EMAIL_HASH_LEN)
	})

	it('returns base36 chars only', () => {
		expect(emailHash()).to.match(/^[0-9a-z]+$/)
	})

	it('returns different values on subsequent calls', () => {
		const a = emailHash()
		const b = emailHash()
		expect(a).to.not.equal(b)
	})
})
