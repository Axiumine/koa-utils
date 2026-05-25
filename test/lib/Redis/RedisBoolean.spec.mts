import { fromRedisBooleanValue } from '@lib/Redis/fromRedisBooleanValue.mjs'
import { RedisBoolean } from '@lib/Redis/RedisBoolean.mjs'
import { toRedisBooleanValue } from '@lib/Redis/toRedisBooleanValue.mjs'
import { expect } from 'chai'

describe('Redis boolean helpers', () => {
	describe('RedisBoolean enum', () => {
		it("true = '1', false = '0'", () => {
			expect(RedisBoolean.true).to.equal('1')
			expect(RedisBoolean.false).to.equal('0')
		})
	})

	describe('toRedisBooleanValue', () => {
		it('true -> "1"', () => {
			expect(toRedisBooleanValue(true)).to.equal('1')
		})
		it('false -> "0"', () => {
			expect(toRedisBooleanValue(false)).to.equal('0')
		})
	})

	describe('fromRedisBooleanValue', () => {
		it('"1" -> true', () => {
			expect(fromRedisBooleanValue(RedisBoolean.true)).to.equal(true)
		})
		it('"0" -> false', () => {
			expect(fromRedisBooleanValue(RedisBoolean.false)).to.equal(false)
		})
		it('any other value -> false (strict compare)', () => {
			expect(fromRedisBooleanValue('true' as unknown as RedisBoolean)).to.equal(false)
			expect(fromRedisBooleanValue('' as unknown as RedisBoolean)).to.equal(false)
		})
	})

	describe('round trip', () => {
		it('to/from preserves boolean', () => {
			expect(fromRedisBooleanValue(toRedisBooleanValue(true))).to.equal(true)
			expect(fromRedisBooleanValue(toRedisBooleanValue(false))).to.equal(false)
		})
	})
})
