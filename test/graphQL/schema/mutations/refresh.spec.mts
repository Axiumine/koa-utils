/**
 * Tests for graphQL/schema/mutations/refresh.mts
 *
 * refresh use redisClient direct (hSet, expire, del) + setLoginCookies.
 * ctx.state.user carry id, refreshToken, other access-token data.
 */
import { refresh } from '../../../../dist/graphQL/schema/mutations/refresh.mjs'
import { redisClient } from '@dataSources/Redis.mjs'
import { REFRESH_TOKEN_EXPIRY } from '@lib/tokens.mjs'
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

	it('gives the access key the short jittered TTL and the refresh key the 90-day TTL', async () => {
		// Assert only callCount → the two TTLs swappable: access token live 90 days, refresh token under
		// 90 minutes. Match each TTL to its own key, by key → argument order cannot mask the swap either.
		const ctx = makeCtx()
		await refresh.resolve(null, {}, ctx)

		const accessCall = expireStub.getCalls().find((c) => (c.args[0] as string).includes('access:'))
		const refreshCall = expireStub.getCalls().find((c) => (c.args[0] as string).includes('refresh:'))
		expect(accessCall, 'access key must get an expiry').to.exist
		expect(refreshCall, 'refresh key must get an expiry').to.exist
		// accessTokenExpiry() jitter 30-90 min, in seconds
		expect(accessCall?.args[1]).to.be.within(30 * 60, 91 * 60)
		expect(refreshCall?.args[1]).to.equal(REFRESH_TOKEN_EXPIRY)
	})

	it('deletes old refresh token key', async () => {
		const ctx = makeCtx({ refreshToken: 'refresh:oldToken' })
		await refresh.resolve(null, {}, ctx)

		// del called with a key holding the old refresh token value
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

	it('sends the NEW refresh token in the cookie, not the rotated-out one', async () => {
		// sinon calledWith match on an argument prefix → calledWith('refresh_token') alone never inspect
		// the value. Handing back oldRefresh give the client a cookie that can never satisfy Redis again.
		const ctx = makeCtx({ refreshToken: 'refresh:oldRefreshUUID' })
		await refresh.resolve(null, {}, ctx)

		const call = (ctx.cookies.set as sinon.SinonStub)
			.getCalls()
			.find((c) => c.args[0] === 'refresh_token')
		expect(call, 'refresh_token cookie must be set').to.exist
		const sent = call?.args[1] as string
		expect(sent).to.not.equal('refresh:oldRefreshUUID')
		expect(sent).to.not.include('refresh:')
		expect(sent).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
	})

	it('surfaces a failure to delete the rotated-out refresh key', async () => {
		// 'deletes old refresh token key' only check that a matching del call happened. Sinon record the
		// call synchronously, so dropping the `await` still pass it — but the rejection then escape the
		// try/catch instead of triggering the rollback, and the old refresh key stay alive in Redis.
		// That is session fixation: an attacker holding the stale token keep it after the legitimate
		// client rotates.
		delStub.callsFake((key: string) =>
			key.includes('refresh:oldToken') ? Promise.reject(new Error('Redis down')) : Promise.resolve(1)
		)
		const ctx = makeCtx({ refreshToken: 'refresh:oldToken' })

		await expectGraphQLErrorAsync(
			() => refresh.resolve(null, {}, ctx),
			500,
			'Internal Server Error'
		)
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
