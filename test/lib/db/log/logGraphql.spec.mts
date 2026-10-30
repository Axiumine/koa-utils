import { logGraphql } from '../../../../dist/lib/db/log/logGraphql.mjs'
import { Types } from 'mongoose'
import { expect } from 'chai'
import mongoose from 'mongoose'
import sinon from 'sinon'

describe('logGraphql', () => {
	it('returns undefined (fire-and-forget constructor, no save)', () => {
		const owner = new Types.ObjectId()
		const result = logGraphql(owner, 'testQuery', 200, 42)
		expect(result).to.be.undefined
	})

	it('accepts any valid ObjectId, name, status and msTot without throwing', () => {
		const owner = new Types.ObjectId()
		expect(() => logGraphql(owner, 'anotherQuery', 500, 0)).to.not.throw()
	})

	it('accepts zero msTot without throwing', () => {
		const owner = new Types.ObjectId()
		expect(() => logGraphql(owner, 'query', 201, 0)).to.not.throw()
	})

	it('builds one stats document carrying owner, nome, status and msTot', () => {
		// Doc never saved → ctor Document.$set(obj) = only observable trace
		const setSpy = sinon.spy(mongoose.Document.prototype, '$set')
		try {
			const owner = new Types.ObjectId()
			logGraphql(owner, 'probeQuery', 418, 77)
			expect(setSpy.callCount).to.equal(1)
			expect(setSpy.firstCall.args[0]).to.deep.equal({ owner, nome: 'probeQuery', status: 418, msTot: 77 })
		} finally {
			setSpy.restore()
		}
	})
})
