import { isSessionBlocked } from '@lib/isSessionBlocked.mjs'
import { expect } from 'chai'

describe('isSessionBlocked', () => {
	it('returns true when disabled is set', () => {
		expect(isSessionBlocked({ disabled: 'true' })).to.equal(true)
	})

	it('returns true when deleted is set (disabled absent)', () => {
		expect(isSessionBlocked({ deleted: 'true' })).to.equal(true)
	})

	it('returns false when neither flag is set', () => {
		expect(isSessionBlocked({})).to.equal(false)
	})
})
