import { logGraphql } from '../../../../dist/lib/db/log/logGraphql.mjs'
import { Types } from 'mongoose'
import { expect } from 'chai'
import mongoose from 'mongoose'
import sinon from 'sinon'

describe('logGraphql', () => {
	it('returns undefined (deprecated no-op)', () => {
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

	it('builds no document', () => {
		// no-op pin: old impl built `LogStatsGraphql` doc → ctor `Document.$set(obj)`. 0 calls → nothing built
		const setSpy = sinon.spy(mongoose.Document.prototype, '$set')
		try {
			const owner = new Types.ObjectId()
			logGraphql(owner, 'probeQuery', 418, 77)
			expect(setSpy.callCount).to.equal(0)
		} finally {
			setSpy.restore()
		}
	})
})
