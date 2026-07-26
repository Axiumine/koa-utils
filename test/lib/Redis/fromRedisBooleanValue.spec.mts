import { fromRedisBooleanValue } from '@lib/Redis/fromRedisBooleanValue.mjs'
import { RedisBoolean } from '@lib/Redis/RedisBoolean.mjs'
import { expect } from 'chai'

describe('fromRedisBooleanValue', () => {
	it('RedisBoolean.true -> true', () => {
		expect(fromRedisBooleanValue(RedisBoolean.true)).to.equal(true)
	})

	it('RedisBoolean.false -> false', () => {
		expect(fromRedisBooleanValue(RedisBoolean.false)).to.equal(false)
	})

	// Redis store everything as strings → both 'true' and 'false' truthy → only a strict
	// match against RedisBoolean.true count as true.
	it('any value other than RedisBoolean.true -> false (strict compare, not truthy check)', () => {
		expect(fromRedisBooleanValue('true' as unknown as RedisBoolean)).to.equal(false)
		expect(fromRedisBooleanValue('false' as unknown as RedisBoolean)).to.equal(false)
		expect(fromRedisBooleanValue('' as unknown as RedisBoolean)).to.equal(false)
	})
})
