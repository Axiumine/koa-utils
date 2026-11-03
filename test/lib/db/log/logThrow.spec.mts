import { logThrow } from '../../../../dist/lib/db/log/logThrow.mjs'
import { expect } from 'chai'
import mongoose, { Types } from 'mongoose'
import sinon from 'sinon'

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

	it('builds one throw document with fresh _id, message, errLevel and insert time', () => {
		// Doc never saved → first Document.$set(obj) from ctor = only observable trace
		const clock = sinon.useFakeTimers(new Date('2024-05-06T07:08:09.000Z'))
		const setSpy = sinon.spy(mongoose.Document.prototype, '$set')
		try {
			logThrow('probe message', 4)
			expect(setSpy.called).to.equal(true)
			const obj = setSpy.firstCall.args[0] as { _id: unknown; message: string; errLevel: number; inserted: Date }
			expect(obj._id).to.be.instanceOf(Types.ObjectId)
			expect(obj.message).to.equal('probe message')
			expect(obj.errLevel).to.equal(4)
			expect(obj.inserted).to.be.instanceOf(Date)
			expect(obj.inserted.toISOString()).to.equal('2024-05-06T07:08:09.000Z')
		} finally {
			setSpy.restore()
			clock.restore()
		}
	})
})
