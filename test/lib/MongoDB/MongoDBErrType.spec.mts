import { MongoDBErrType } from '@lib/MongoDB/MongoDBErrType.mjs'
import { expect } from 'chai'

describe('MongoDBErrType', () => {
	it('DuplicateKeyError = 11000', () => {
		expect(MongoDBErrType.DuplicateKeyError).to.equal(11000)
	})
})
