import { authenticatedAuthorizationHandler } from '../../../dist/koa/middleware/authenticatedAuthorizationHandler/index.mjs'
import { expect } from 'chai'
import Keygrip from 'keygrip'
import sinon from 'sinon'
import * as RedisMod from '../../../dist/dataSources/Redis.mjs'

import { expectGraphQLErrorAsync } from '../../helpers/assertGraphQLError.mjs'

// Real Keygrip instance — used to produce valid signed cookies so
// verifySignedRefreshToken (non-stubbable ESM export) passes.
const keys = new Keygrip(['k1'])
const TOKEN = 'test-refresh-uuid'
const SIG = keys.sign(`refresh_token=${TOKEN}`)
const VALID_COOKIE = `refresh_token=${TOKEN}; refresh_token.sig=${SIG}`
const REDIS_REFRESH_KEY = `refresh:${TOKEN}`

describe('authenticatedAuthorizationHandler', () => {
	afterEach(() => {
		sinon.restore()
	})

	it('returns a middleware function from keys', () => {
		expect(authenticatedAuthorizationHandler(keys)).to.be.a('function')
	})

	it('throws 412 Precondition Failed when no cookie header', async () => {
		const mw = authenticatedAuthorizationHandler(keys)
		const ctx = { request: { header: {} }, state: {} } as never
		await expectGraphQLErrorAsync(
			() => mw(ctx, async () => undefined),
			412,
			'Precondition Failed',
			'No authorization cookie.'
		)
	})

	it('throws 499 Token Required when refresh_token cookie missing', async () => {
		const mw = authenticatedAuthorizationHandler(keys)
		const ctx = { request: { header: { cookie: 'other=val' } }, state: {} } as never
		await expectGraphQLErrorAsync(
			() => mw(ctx, async () => undefined),
			499,
			'Token Required',
			'Refresh Token Required.'
		)
	})

	it('throws 499 when refresh_token.sig cookie missing', async () => {
		const mw = authenticatedAuthorizationHandler(keys)
		const ctx = { request: { header: { cookie: `refresh_token=${TOKEN}` } }, state: {} } as never
		await expectGraphQLErrorAsync(
			() => mw(ctx, async () => undefined),
			499,
			'Token Required'
		)
	})

	it('throws 401 when signature is invalid', async () => {
		const mw = authenticatedAuthorizationHandler(keys)
		const ctx = {
			request: { header: { cookie: `refresh_token=${TOKEN}; refresh_token.sig=badsig` } },
			state: {}
		} as never
		await expectGraphQLErrorAsync(
			() => mw(ctx, async () => undefined),
			401,
			'Unauthorized'
		)
	})

	it('populates ctx.state.user and calls next when valid session found in Redis', async () => {
		sinon.stub(RedisMod.redisClient, 'hGetAll').resolves({ id: '507f1f77bcf86cd799439011', email: 'u@test.com' })
		const mw = authenticatedAuthorizationHandler(keys)
		const ctx = { request: { header: { cookie: VALID_COOKIE } }, state: {} } as never
		let nextCalled = false
		await mw(ctx, async () => { nextCalled = true })
		expect(nextCalled).to.equal(true)
		const state = (ctx as never as { state: { user: { refreshToken: string } } }).state
		expect(state.user.refreshToken).to.equal(REDIS_REFRESH_KEY)
	})

	it('sets ctx.state.user.id to the ObjectId of the session actually found in Redis', async () => {
		// refresh's resolver uses ctx.state.user.id as the userId for the new session.
		// Nothing asserted this, so the id could be detached from the real session
		// entirely (e.g. a freshly generated ObjectId) without any test noticing.
		sinon.stub(RedisMod.redisClient, 'hGetAll').resolves({ id: '507f1f77bcf86cd799439011', email: 'u@test.com' })
		const mw = authenticatedAuthorizationHandler(keys)
		const ctx = { request: { header: { cookie: VALID_COOKIE } }, state: {} } as never
		await mw(ctx, async () => undefined)
		const state = (ctx as never as { state: { user: { id: unknown } } }).state
		expect(String(state.user.id)).to.equal('507f1f77bcf86cd799439011')
	})

	it('throws 403 Forbidden when session has disabled flag', async () => {
		sinon.stub(RedisMod.redisClient, 'hGetAll').resolves({ id: '507f1f77bcf86cd799439011', disabled: 'true' })
		const mw = authenticatedAuthorizationHandler(keys)
		const ctx = { request: { header: { cookie: VALID_COOKIE } }, state: {} } as never
		await expectGraphQLErrorAsync(
			() => mw(ctx, async () => undefined),
			403,
			'Forbidden'
		)
	})

	it('throws 403 Forbidden when session has deleted flag', async () => {
		sinon.stub(RedisMod.redisClient, 'hGetAll').resolves({ id: '507f1f77bcf86cd799439011', deleted: 'true' })
		const mw = authenticatedAuthorizationHandler(keys)
		const ctx = { request: { header: { cookie: VALID_COOKIE } }, state: {} } as never
		await expectGraphQLErrorAsync(
			() => mw(ctx, async () => undefined),
			403,
			'Forbidden'
		)
	})

	it('throws 498 Invalid Token when refresh session empty and no introspection code', async () => {
		sinon.stub(RedisMod.redisClient, 'hGetAll').resolves({})
		const mw = authenticatedAuthorizationHandler(keys)
		const ctx = { request: { header: { cookie: VALID_COOKIE } }, state: {} } as never
		await expectGraphQLErrorAsync(
			() => mw(ctx, async () => undefined),
			498,
			'Invalid Token'
		)
	})

	it('calls next when Redis empty but introspection code matches', async () => {
		sinon.stub(RedisMod.redisClient, 'hGetAll').resolves({})
		const savedCode = process.env.INTROSPECTION_CODE
		process.env.INTROSPECTION_CODE = 'icode'
		try {
			const mw = authenticatedAuthorizationHandler(keys)
			const ctx = {
				request: { header: { cookie: VALID_COOKIE, 'x-introspectioncode': 'icode' } },
				state: {}
			} as never
			let nextCalled = false
			await mw(ctx, async () => { nextCalled = true })
			expect(nextCalled).to.equal(true)
		} finally {
			process.env.INTROSPECTION_CODE = savedCode
		}
	})
})
