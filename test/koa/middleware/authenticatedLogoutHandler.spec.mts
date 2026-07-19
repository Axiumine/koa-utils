import { authenticatedLogoutHandler } from '../../../dist/koa/middleware/authenticatedLogoutHandler/index.mjs'
import { expect } from 'chai'
import Keygrip from 'keygrip'
import sinon from 'sinon'
import * as RedisMod from '../../../dist/dataSources/Redis.mjs'

import { expectGraphQLErrorAsync } from '../../helpers/assertGraphQLError.mjs'

// Real Keygrip instance — verifySignedRefreshToken is a non-stubbable ESM export,
// so we provide a properly signed cookie to pass it for real.
const keys = new Keygrip(['k1'])
const TOKEN = 'logout-test-uuid'
const SIG = keys.sign(`refresh_token=${TOKEN}`)
const VALID_COOKIE = `refresh_token=${TOKEN}; refresh_token.sig=${SIG}`
const REDIS_REFRESH_KEY = `refresh:${TOKEN}`
const ACCESS_UUID = '11111111-1111-4111-8111-111111111111'

describe('authenticatedLogoutHandler', () => {
	afterEach(() => {
		sinon.restore()
	})

	it('returns a middleware function from keys', () => {
		expect(authenticatedLogoutHandler(keys)).to.be.a('function')
	})

	it('throws 412 Precondition Failed when no cookie + no introspection', async () => {
		const mw = authenticatedLogoutHandler(keys)
		const ctx = { request: { header: {} }, state: {} } as never
		await expectGraphQLErrorAsync(
			() => mw(ctx, async () => undefined),
			412,
			'Precondition Failed',
			'No authorization cookie.'
		)
	})

	it('throws 412 NoAuthHeader when cookie present but authorization missing + no introspection', async () => {
		const mw = authenticatedLogoutHandler(keys)
		const ctx = { request: { header: { cookie: 'refresh_token=x' } }, state: {} } as never
		await expectGraphQLErrorAsync(
			() => mw(ctx, async () => undefined),
			412,
			'Precondition Failed',
			'No authorization header.'
		)
	})

	it('sets introspection=true and calls next when no cookie but introspection code present', async () => {
		const savedCode = process.env.INTROSPECTION_CODE
		process.env.INTROSPECTION_CODE = 'icode'
		try {
			const mw = authenticatedLogoutHandler(keys)
			const ctx = {
				request: { header: { 'x-introspectioncode': 'icode' } },
				state: {}
			} as never
			let nextCalled = false
			await mw(ctx, async () => { nextCalled = true })
			expect(nextCalled).to.equal(true)
		} finally {
			process.env.INTROSPECTION_CODE = savedCode
		}
	})

	it('sets introspection=true and calls next when no authorization but introspection code present', async () => {
		const savedCode = process.env.INTROSPECTION_CODE
		process.env.INTROSPECTION_CODE = 'icode'
		try {
			const mw = authenticatedLogoutHandler(keys)
			const ctx = {
				request: { header: { cookie: 'refresh_token=x', 'x-introspectioncode': 'icode' } },
				state: {}
			} as never
			let nextCalled = false
			await mw(ctx, async () => { nextCalled = true })
			expect(nextCalled).to.equal(true)
		} finally {
			process.env.INTROSPECTION_CODE = savedCode
		}
	})

	it('populates ctx.state.user with refresh + access token on full logout', async () => {
		sinon.stub(RedisMod.redisClient, 'hGet')
			.onFirstCall().resolves('507f1f77bcf86cd799439011')  // refresh lookup
			.onSecondCall().resolves('507f1f77bcf86cd799439011') // access lookup
		const mw = authenticatedLogoutHandler(keys)
		const ctx = {
			request: { header: { cookie: VALID_COOKIE, authorization: `Bearer access:${ACCESS_UUID}` } },
			state: {}
		} as never
		let nextCalled = false
		await mw(ctx, async () => { nextCalled = true })
		expect(nextCalled).to.equal(true)
		const state = (ctx as never as { state: { user: { refreshToken: string; accessToken: string } } }).state
		expect(state.user.refreshToken).to.equal(REDIS_REFRESH_KEY)
		expect(state.user.accessToken).to.equal(`access:${ACCESS_UUID}`)
	})

	it('populates refresh token only when access session is expired (null)', async () => {
		sinon.stub(RedisMod.redisClient, 'hGet')
			.onFirstCall().resolves('uid')
			.onSecondCall().resolves(null)
		const mw = authenticatedLogoutHandler(keys)
		const ctx = {
			request: { header: { cookie: VALID_COOKIE, authorization: `Bearer access:${ACCESS_UUID}` } },
			state: {}
		} as never
		await mw(ctx, async () => undefined)
		const state = (ctx as never as { state: { user: { refreshToken: string; accessToken?: string } } }).state
		expect(state.user.refreshToken).to.equal(REDIS_REFRESH_KEY)
		expect(state.user.accessToken).to.be.undefined
	})

	it('ignores an authorization header that is not prefixed "Bearer access:"', async () => {
		// Without the prefix check, the client would pick the entire Redis key
		// and could read refresh: entries by going through the access branch.
		const hGet = sinon.stub(RedisMod.redisClient, 'hGet').resolves('uid')
		const mw = authenticatedLogoutHandler(keys)
		const ctx = {
			request: { header: { cookie: VALID_COOKIE, authorization: `Bearer ${REDIS_REFRESH_KEY}` } },
			state: {}
		} as never
		await mw(ctx, async () => undefined)
		const state = (ctx as never as { state: { user: { refreshToken: string; accessToken?: string } } }).state
		expect(state.user.refreshToken).to.equal(REDIS_REFRESH_KEY)
		expect(state.user.accessToken).to.be.undefined
		// only the refresh lookup: the malformed token never reaches Redis
		expect(hGet.callCount).to.equal(1)
	})

	it('ignores a well-prefixed access token whose suffix is not a v4 uuid', async () => {
		// The prefix alone still leaves the rest of the Redis key client-controlled.
		const hGet = sinon.stub(RedisMod.redisClient, 'hGet').resolves('uid')
		const mw = authenticatedLogoutHandler(keys)
		const ctx = {
			request: { header: { cookie: VALID_COOKIE, authorization: 'Bearer access:not-a-uuid' } },
			state: {}
		} as never
		await mw(ctx, async () => undefined)
		const state = (ctx as never as { state: { user: { refreshToken: string; accessToken?: string } } }).state
		expect(state.user.refreshToken).to.equal(REDIS_REFRESH_KEY)
		expect(state.user.accessToken).to.be.undefined
		// only the refresh lookup: the malformed token never reaches Redis
		expect(hGet.callCount).to.equal(1)
	})

	it('throws 204 (AlreadyDone) when refresh token not in Redis', async () => {
		sinon.stub(RedisMod.redisClient, 'hGet').resolves(null)
		const mw = authenticatedLogoutHandler(keys)
		const ctx = {
			request: { header: { cookie: VALID_COOKIE, authorization: `Bearer access:${ACCESS_UUID}` } },
			state: {}
		} as never
		await expectGraphQLErrorAsync(
			() => mw(ctx, async () => undefined),
			204,
			''
		)
	})
})
