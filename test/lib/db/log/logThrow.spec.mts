import { logThrow } from '../../../../dist/lib/db/log/logThrow.mjs'
import { expect } from 'chai'
import mongoose from 'mongoose'
import sinon from 'sinon'

describe('logThrow', () => {
	it('returns undefined (deprecated no-op)', () => {
		const result = logThrow('something went wrong', 1)
		expect(result).to.be.undefined
	})

	it('accepts any log string and errLevel without throwing', () => {
		expect(() => logThrow('error message', 3)).to.not.throw()
	})

	it('accepts errLevel 0 without throwing', () => {
		expect(() => logThrow('minor issue', 0)).to.not.throw()
	})

	it('builds no document', () => {
		// no-op pin: old impl built `LogThrow` doc → ctor `Document.$set(obj)`. 0 calls → nothing built
		const setSpy = sinon.spy(mongoose.Document.prototype, '$set')
		try {
			logThrow('probe message', 4)
			expect(setSpy.callCount).to.equal(0)
		} finally {
			setSpy.restore()
		}
	})
})
