import { logThrow } from '../../../../dist/lib/db/log/logThrow.mjs'
import { expect } from 'chai'

describe('logThrow', () => {
	it('returns undefined (fire-and-forget constructor, no save)', () => {
		const result = logThrow('something went wrong', 1)
		expect(result).to.be.undefined
	})

	it('accepts any log string and errLevel without throwing', () => {
		expect(() => logThrow('error message', 3)).to.not.throw()
	})

	it('accepts errLevel 0 without throwing', () => {
		expect(() => logThrow('minor issue', 0)).to.not.throw()
	})
})
