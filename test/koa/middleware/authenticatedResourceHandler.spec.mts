import { authenticatedResourceHandler } from '../../../dist/koa/middleware/authenticatedResourceHandler/index.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import * as RedisMod from '../../../dist/dataSources/Redis.mjs'

import { expectGraphQLErrorAsync } from '../../helpers/assertGraphQLError.mjs'

const VALID_UUID = '11111111-1111-4111-8111-111111111111'

describe('authenticatedResourceHandler', () => {
	afterEach(() => {
		sinon.restore()
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
		// The prefix check alone leaves the rest of the Redis key client-controlled.
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
		// the malformed token never reaches Redis
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
		process.env.INTROSPECTION_CODE = 'secret123'
		const mw = authenticatedResourceHandler()
		const ctx = {
			request: { header: { authorization: `Bearer access:${VALID_UUID}`, 'x-introspectioncode': 'secret123' } },
			state: {}
		} as never
		let nextCalled = false
		await mw(ctx, async () => { nextCalled = true })
		expect(nextCalled).to.equal(true)
	})
})
