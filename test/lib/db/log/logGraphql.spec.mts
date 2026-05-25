import { logGraphql } from '../../../../dist/lib/db/log/logGraphql.mjs'
import { Types } from 'mongoose'
import { expect } from 'chai'

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
})
