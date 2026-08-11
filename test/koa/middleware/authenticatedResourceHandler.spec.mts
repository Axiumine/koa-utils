import { authenticatedResourceHandler } from '../../../dist/koa/middleware/authenticatedResourceHandler/index.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import * as RedisMod from '../../../dist/dataSources/Redis.mjs'

import { expectGraphQLErrorAsync } from '../../helpers/assertGraphQLError.mjs'
import { restoreIntrospectionCode, saveIntrospectionCode } from '../../helpers/introspectionCode.mjs'
import { restoreNodeEnv, saveNodeEnv } from '../../helpers/nodeEnv.mjs'

const VALID_UUID = '11111111-1111-4111-8111-111111111111'

describe('authenticatedResourceHandler', () => {
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

	it('returns a middleware function', () => {
		expect(authenticatedResourceHandler()).to.be.a('function')
	})

	it('throws 412 Precondition Failed when authorization header missing', async () => {
		const mw = authenticatedResourceHandler()
		const ctx = { request: { header: {} }, state: {} } as never
		await expectGraphQLErrorAsync(
			() => mw(ctx, async () => undefined),
			412,
			'Precondition Failed',
			'No authorization header.'
		)
	})

	it('throws 499 Access Token Required when prefix not "Bearer access:"', async () => {
		const mw = authenticatedResourceHandler()
		const ctx = {
			request: { header: { authorization: 'Bearer something' } },
			state: {}
		} as never
		await expectGraphQLErrorAsync(
			() => mw(ctx, async () => undefined),
			499,
			'Token Required',
			'Access Token Required.'
		)
	})

	it('throws 499 Missing/malformed when the "access:" suffix is not a v4 uuid', async () => {
		// Prefix check alone → rest of the Redis key still client-controlled.
		const hGetAll = sinon.stub(RedisMod.redisClient, 'hGetAll').resolves({})
		const mw = authenticatedResourceHandler()
		const ctx = {
			request: { header: { authorization: 'Bearer access:not-a-uuid' } },
			state: {}
		} as never
		await expectGraphQLErrorAsync(
			() => mw(ctx, async () => undefined),
			499,
			'Token Required',
			'Missing/malformed/invalid token.'
		)
		// malformed token never reach Redis
		expect(hGetAll.callCount).to.equal(0)
	})

	it('populates ctx.state.user and calls next when valid session found in Redis', async () => {
		sinon.stub(RedisMod.redisClient, 'hGetAll').resolves({ id: '507f1f77bcf86cd799439011', email: 'test@test.com' })
		const mw = authenticatedResourceHandler()
		const ctx = {
			request: { header: { authorization: `Bearer access:${VALID_UUID}` } },
			state: {}
		} as never
		let nextCalled = false
		await mw(ctx, async () => { nextCalled = true })
		expect(nextCalled).to.equal(true)
		expect((ctx as never as { state: { user: { email: string } } }).state.user.email).to.equal('test@test.com')
	})

	it('sets ctx.state.user.id to the ObjectId of the session actually found in Redis', async () => {
		// Downstream resolvers scope every read/write to ctx.state.user.id. Only .email
		// asserted → id could detach from the real session unnoticed.
		sinon.stub(RedisMod.redisClient, 'hGetAll').resolves({ id: '507f1f77bcf86cd799439011', email: 'test@test.com' })
		const mw = authenticatedResourceHandler()
		const ctx = {
			request: { header: { authorization: `Bearer access:${VALID_UUID}` } },
			state: {}
		} as never
		await mw(ctx, async () => undefined)
		expect(String((ctx as never as { state: { user: { id: unknown } } }).state.user.id)).to.equal(
			'507f1f77bcf86cd799439011'
		)
	})

	it('throws 403 Forbidden when session has disabled=true', async () => {
		sinon.stub(RedisMod.redisClient, 'hGetAll').resolves({ id: '507f1f77bcf86cd799439011', disabled: 'true' })
		const mw = authenticatedResourceHandler()
		const ctx = {
			request: { header: { authorization: `Bearer access:${VALID_UUID}` } },
			state: {}
		} as never
		await expectGraphQLErrorAsync(
			() => mw(ctx, async () => undefined),
			403,
			'Forbidden'
		)
	})

	it('throws 403 Forbidden when session has deleted=true', async () => {
		sinon.stub(RedisMod.redisClient, 'hGetAll').resolves({ id: '507f1f77bcf86cd799439011', deleted: 'true' })
		const mw = authenticatedResourceHandler()
		const ctx = {
			request: { header: { authorization: `Bearer access:${VALID_UUID}` } },
			state: {}
		} as never
		await expectGraphQLErrorAsync(
			() => mw(ctx, async () => undefined),
			403,
			'Forbidden'
		)
	})

	it('throws 498 Invalid Token when session empty and no introspection code', async () => {
		sinon.stub(RedisMod.redisClient, 'hGetAll').resolves({})
		const mw = authenticatedResourceHandler()
		const ctx = {
			request: { header: { authorization: `Bearer access:${VALID_UUID}` } },
			state: {}
		} as never
		await expectGraphQLErrorAsync(
			() => mw(ctx, async () => undefined),
			498,
			'Invalid Token'
		)
	})

	it('calls next when session empty but valid introspection code provided', async () => {
		sinon.stub(RedisMod.redisClient, 'hGetAll').resolves({})
		const savedCode = saveIntrospectionCode()
		process.env.INTROSPECTION_CODE = 'secret123'
		try {
			const mw = authenticatedResourceHandler()
			const ctx = {
				request: { header: { authorization: `Bearer access:${VALID_UUID}`, 'x-introspectioncode': 'secret123' } },
				state: {}
			} as never
			let nextCalled = false
			await mw(ctx, async () => { nextCalled = true })
			expect(nextCalled).to.equal(true)
		} finally {
			restoreIntrospectionCode(savedCode)
		}
	})

	it('throws 498 under NODE_ENV=production even when the introspection code matches', async () => {
		// Behaviour break shipped in 6.0.0. Secret set, header match it exactly — the request is
		// refused purely because the process is not on the bypass allowlist.
		sinon.stub(RedisMod.redisClient, 'hGetAll').resolves({})
		const savedCode = saveIntrospectionCode()
		process.env.NODE_ENV = 'production'
		process.env.INTROSPECTION_CODE = 'secret123'
		try {
			const mw = authenticatedResourceHandler()
			const ctx = {
				request: { header: { authorization: `Bearer access:${VALID_UUID}`, 'x-introspectioncode': 'secret123' } },
				state: {}
			} as never
			await expectGraphQLErrorAsync(
				() => mw(ctx, async () => undefined),
				498,
				'Invalid Token'
			)
		} finally {
			restoreIntrospectionCode(savedCode)
		}
	})

	it('throws 498 for header "undefined" when INTROSPECTION_CODE is unset', async () => {
		// Check was `header !== `${process.env.INTROSPECTION_CODE}`` → compares against
		// string 'undefined' once the var is unset. Any caller send that value → walk past
		// the expired/deleted-token rejection with no secret at all.
		sinon.stub(RedisMod.redisClient, 'hGetAll').resolves({})
		const savedCode = saveIntrospectionCode()
		delete process.env.INTROSPECTION_CODE
		try {
			const mw = authenticatedResourceHandler()
			const ctx = {
				request: { header: { authorization: `Bearer access:${VALID_UUID}`, 'x-introspectioncode': 'undefined' } },
				state: {}
			} as never
			await expectGraphQLErrorAsync(
				() => mw(ctx, async () => undefined),
				498,
				'Invalid Token'
			)
		} finally {
			restoreIntrospectionCode(savedCode)
		}
	})
})
