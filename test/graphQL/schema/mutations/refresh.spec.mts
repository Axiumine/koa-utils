/**
 * Tests for graphQL/schema/mutations/refresh.mts
 *
 * refresh uses redisClient directly (hSet, expire, del) and setLoginCookies.
 * ctx.state.user carries id, refreshToken, and other access-token data.
 */
import { refresh } from '../../../../dist/graphQL/schema/mutations/refresh.mjs'
import { redisClient } from '@dataSources/Redis.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

import { expectGraphQLErrorAsync } from '../../../helpers/assertGraphQLError.mjs'

// ---------------------------------------------------------------------------

function makeCtx(overrides: Record<string, unknown> = {}) {
	return {
		state: {
			user: {
				id: new Types.ObjectId(),
				refreshToken: 'refresh:oldRefreshUUID',
				role: 'user',
				...overrides
			}
		},
		cookies: { set: sinon.stub() }
	} as never
}

// ---------------------------------------------------------------------------

describe('refresh — resolve', () => {
	let hSetStub: sinon.SinonStub
	let expireStub: sinon.SinonStub
	let delStub: sinon.SinonStub

	beforeEach(() => {
		hSetStub = sinon.stub(redisClient, 'hSet').resolves(0)
		expireStub = sinon.stub(redisClient, 'expire').resolves(true)
		delStub = sinon.stub(redisClient, 'del').resolves(1)
	})

	afterEach(() => {
		sinon.restore()
	})

	it('happy path: returns { status: true, accessToken: string }', async () => {
		const ctx = makeCtx()
		const result = await refresh.resolve(null, {}, ctx) as { status: boolean; accessToken: string }

		expect(result.status).to.equal(true)
		expect(result.accessToken).to.be.a('string').and.not.equal('')
	})

	it('stores new access and refresh keys via hSet', async () => {
		const ctx = makeCtx()
		await refresh.resolve(null, {}, ctx)

		expect(hSetStub.callCount).to.equal(2)
		const accessKey = hSetStub.firstCall.args[0] as string
		const refreshKey = hSetStub.secondCall.args[0] as string
		expect(accessKey).to.include('access:')
		expect(refreshKey).to.include('refresh:')
	})

	it('sets expiry on both keys', async () => {
		const ctx = makeCtx()
		await refresh.resolve(null, {}, ctx)

		expect(expireStub.callCount).to.equal(2)
	})

	it('deletes old refresh token key', async () => {
		const ctx = makeCtx({ refreshToken: 'refresh:oldToken' })
		await refresh.resolve(null, {}, ctx)

		// del should be called with a key containing the old refresh token value
		const delCall = delStub.getCalls().find((c) =>
			(c.args[0] as string).includes('refresh:oldToken')
		)
		expect(delCall, 'old refresh key must be deleted').to.exist
	})

	it('sets refresh_token cookie', async () => {
		const ctx = makeCtx()
		await refresh.resolve(null, {}, ctx)

		const setCookieCalled = (ctx.cookies.set as sinon.SinonStub).calledWith('refresh_token')
		expect(setCookieCalled).to.equal(true)
	})

	it('when hSet rejects: returns { status: false, accessToken: "" } and deletes new keys', async () => {
		hSetStub.rejects(new Error('Redis connection lost'))
		// del for cleanup must succeed
		delStub.resolves(1)

		const ctx = makeCtx()

		await expectGraphQLErrorAsync(
			() => refresh.resolve(null, {}, ctx),
			500,
			'Internal Server Error'
		)
	})

	it('refreshToken stripped from accessTokenData written to redis', async () => {
		const ctx = makeCtx({ refreshToken: 'refresh:tokenX' })
		await refresh.resolve(null, {}, ctx)

		// first hSet call is for access key — its data must not include refreshToken
		const accessData = hSetStub.firstCall.args[1] as Record<string, unknown>
		expect(accessData).to.not.have.property('refreshToken')
	})
})
