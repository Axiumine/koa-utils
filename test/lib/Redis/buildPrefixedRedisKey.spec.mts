import { buildPrefixedRedisKey } from '@lib/Redis/buildPrefixedRedisKey.mjs'
import { expect } from 'chai'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('buildPrefixedRedisKey', () => {
	it('adds the prefix to a bare token', () => {
		expect(buildPrefixedRedisKey('refresh:', UUID)).to.equal(`refresh:${UUID}`)
	})

	it('leaves an already-prefixed token untouched', () => {
		expect(buildPrefixedRedisKey('refresh:', `refresh:${UUID}`)).to.equal(`refresh:${UUID}`)
	})

	it('adds the access: prefix to a bare token', () => {
		expect(buildPrefixedRedisKey('access:', UUID)).to.equal(`access:${UUID}`)
	})

	it('leaves an already access:-prefixed token untouched', () => {
		expect(buildPrefixedRedisKey('access:', `access:${UUID}`)).to.equal(`access:${UUID}`)
	})

	it('only matches the prefix at the start — a token merely containing it is still prefixed', () => {
		expect(buildPrefixedRedisKey('access:', `x-access:${UUID}`)).to.equal(`access:x-access:${UUID}`)
	})
})
