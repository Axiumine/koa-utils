import { RedisBoolean } from '@lib/Redis/RedisBoolean.mjs'
import { expect } from 'chai'

describe('RedisBoolean enum', () => {
	it("true = '1', false = '0'", () => {
		expect(RedisBoolean.true).to.equal('1')
		expect(RedisBoolean.false).to.equal('0')
	})
})
