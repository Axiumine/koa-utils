import { authenticatedLogoutHandler } from '../../../dist/koa/middleware/authenticatedLogoutHandler/index.mjs'
import { expect } from 'chai'
import Keygrip from 'keygrip'
import sinon from 'sinon'
import * as RedisMod from '../../../dist/dataSources/Redis.mjs'

import { expectGraphQLErrorAsync } from '../../helpers/assertGraphQLError.mjs'
import { restoreIntrospectionCode, saveIntrospectionCode } from '../../helpers/introspectionCode.mjs'
import { restoreNodeEnv, saveNodeEnv } from '../../helpers/nodeEnv.mjs'

// Real Keygrip: verifySignedRefreshToken is a non-stubbable ESM export →
// supply a properly signed cookie, pass it for real.
const keys = new Keygrip(['k1'])
const TOKEN = 'logout-test-uuid'
const SIG = keys.sign(`refresh_token=${TOKEN}`)
const VALID_COOKIE = `refresh_token=${TOKEN}; refresh_token.sig=${SIG}`
const REDIS_REFRESH_KEY = `refresh:${TOKEN}`
const ACCESS_UUID = '11111111-1111-4111-8111-111111111111'

describe('authenticatedLogoutHandler', () => {
	let savedEnv: string | undefined

	beforeEach(() => {
		savedEnv = saveNodeEnv()
		// Bypass env-gated since 6.0.0. Mocha set no NODE_ENV → gate refuse → every
		// introspection spec below assert nothing unless env pinned to an allowed value.
		process.env.NODE_ENV = 'test'
	})

	afterEach(() => {
		sinon.restore()
		restoreNodeEnv(savedEnv)
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
		const savedCode = saveIntrospectionCode()
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
			restoreIntrospectionCode(savedCode)
		}
	})

	it('sets introspection=true and calls next when no authorization but introspection code present', async () => {
		const savedCode = saveIntrospectionCode()
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
			restoreIntrospectionCode(savedCode)
		}
	})

	it('throws 412 under NODE_ENV=production even when the introspection code matches', async () => {
		// Behaviour break shipped in 6.0.0. Secret set, header match it exactly — the missing
		// cookie stop being tolerated purely because the process is not on the bypass allowlist.
		const savedCode = saveIntrospectionCode()
		process.env.NODE_ENV = 'production'
		process.env.INTROSPECTION_CODE = 'icode'
		try {
			const mw = authenticatedLogoutHandler(keys)
			const ctx = {
				request: { header: { 'x-introspectioncode': 'icode' } },
				state: {}
			} as never
			await expectGraphQLErrorAsync(
				() => mw(ctx, async () => undefined),
				412,
				'Precondition Failed',
				'No authorization cookie.'
			)
		} finally {
			restoreIntrospectionCode(savedCode)
		}
	})

	it('throws 412 for header "undefined" when INTROSPECTION_CODE is unset', async () => {
		// requireIntrospectionOrThrow compared against `${process.env.INTROSPECTION_CODE}`.
		// Unset var → header value 'undefined' became a valid introspection bypass: caller
		// skipped the whole logout body and still got a success response.
		const savedCode = saveIntrospectionCode()
		delete process.env.INTROSPECTION_CODE
		try {
			const mw = authenticatedLogoutHandler(keys)
			const ctx = {
				request: { header: { 'x-introspectioncode': 'undefined' } },
				state: {}
			} as never
			await expectGraphQLErrorAsync(
				() => mw(ctx, async () => undefined),
				412,
				'Precondition Failed',
				'No authorization cookie.'
			)
		} finally {
			restoreIntrospectionCode(savedCode)
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
		// No prefix check → client pick the whole Redis key → read refresh:
		// entries through the access branch.
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
		// only refresh lookup: malformed token never reach Redis
		expect(hGet.callCount).to.equal(1)
	})

	it('ignores "Bearer refresh:<valid uuid>" — the prefix check, not the uuid check, must reject it', async () => {
		// Test above use TOKEN = 'logout-test-uuid', not a v4 uuid → uuid check reject it
		// with or without the prefix check → it cannot demonstrate what its comment claim.
		// Real refresh tokens ARE v4 uuids (generateRefreshToken) → this shape matter: drop
		// the 'Bearer access:' prefix check → client hand over a refresh: key and read
		// refresh entries through the access branch. Verified to fail if that check dropped.
		const uuidToken = '22222222-2222-4222-8222-222222222222'
		const sig = keys.sign(`refresh_token=${uuidToken}`)
		const cookie = `refresh_token=${uuidToken}; refresh_token.sig=${sig}`
		const hGet = sinon.stub(RedisMod.redisClient, 'hGet').resolves('uid')
		const mw = authenticatedLogoutHandler(keys)
		const ctx = {
			request: { header: { cookie, authorization: `Bearer refresh:${uuidToken}` } },
			state: {}
		} as never
		await mw(ctx, async () => undefined)
		const state = (ctx as never as { state: { user: { refreshToken: string; accessToken?: string } } }).state
		expect(state.user.refreshToken).to.equal(`refresh:${uuidToken}`)
		expect(state.user.accessToken).to.be.undefined
		// only refresh lookup: refresh-prefixed value never reach the access branch
		expect(hGet.callCount).to.equal(1)
	})

	it('ignores a well-prefixed access token whose suffix is not a v4 uuid', async () => {
		// Prefix alone → rest of the Redis key still client-controlled.
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
		// only refresh lookup: malformed token never reach Redis
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
