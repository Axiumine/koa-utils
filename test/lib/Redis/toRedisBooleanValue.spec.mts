import { RedisBoolean } from '@lib/Redis/RedisBoolean.mjs'
import { toRedisBooleanValue } from '@lib/Redis/toRedisBooleanValue.mjs'
import { expect } from 'chai'

describe('toRedisBooleanValue', () => {
	it('true -> RedisBoolean.true', () => {
		expect(toRedisBooleanValue(true)).to.equal(RedisBoolean.true)
	})

	it('false -> RedisBoolean.false', () => {
		expect(toRedisBooleanValue(false)).to.equal(RedisBoolean.false)
	})
})
