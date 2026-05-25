/**
 * Tests for graphQL/schema/mutations/logout.mts
 *
 * logout imports redisClient directly (module-level singleton). Stub its del method.
 * ctx is IContextLogout — carries state.user.refreshToken + optional accessToken.
 */
import { logout } from '../../../../dist/graphQL/schema/mutations/logout.mjs'
import { redisClient } from '@dataSources/Redis.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

// ---------------------------------------------------------------------------

function makeCtx(refreshToken: string, accessToken = '') {
	return {
		state: {
			user: {
				refreshToken,
				accessToken
			}
		},
		cookies: { set: sinon.stub() }
	} as never
}

// ---------------------------------------------------------------------------

describe('logout — resolve', () => {
	let delStub: sinon.SinonStub

	beforeEach(() => {
		delStub = sinon.stub(redisClient, 'del').resolves(1)
	})

	afterEach(() => {
		sinon.restore()
	})

	it('happy path: deletes refresh token key and returns true', async () => {
		const ctx = makeCtx('myRefreshToken')
		const result = await logout.resolve(null, {}, ctx)

		expect(result).to.equal(true)
		// del called with refresh key
		const refreshCall = delStub.getCalls().find((c) =>
			(c.args[0] as string).includes('refresh:myRefreshToken')
		)
		expect(refreshCall, 'should delete refresh key').to.exist
	})

	it('when accessToken is non-empty: deletes access token key too', async () => {
		const ctx = makeCtx('refreshTok', 'accessTok')
		const result = await logout.resolve(null, {}, ctx)

		expect(result).to.equal(true)
		expect(delStub.callCount).to.equal(2)
		const accessCall = delStub.getCalls().find((c) =>
			(c.args[0] as string).includes('access:accessTok')
		)
		expect(accessCall, 'should delete access key').to.exist
	})

	it('when accessToken is empty string: skips access token deletion', async () => {
		const ctx = makeCtx('refreshTok', '')
		const result = await logout.resolve(null, {}, ctx)

		expect(result).to.equal(true)
		expect(delStub.callCount).to.equal(1)
	})

	it('sets refresh_token cookie to empty string', async () => {
		const ctx = makeCtx('someTok')
		await logout.resolve(null, {}, ctx)

		const cookieSet = (ctx.cookies.set as sinon.SinonStub)
		expect(cookieSet.calledWith('refresh_token', '')).to.equal(true)
	})

	it('still returns true when del rejects (error silently swallowed)', async () => {
		delStub.rejects(new Error('Redis down'))
		const ctx = makeCtx('refreshTok')

		const result = await logout.resolve(null, {}, ctx)
		expect(result).to.equal(true)
	})
})
