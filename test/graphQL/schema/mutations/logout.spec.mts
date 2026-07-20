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

	it('clears the refresh_token cookie when accessToken is absent (not just empty string)', async () => {
		// Every fixture passed an explicit '' for accessToken, so the `|| ''` fallback was
		// never exercised. authenticatedLogoutHandler leaves accessToken genuinely
		// undefined when the access session has expired — the common logout case. Without
		// the fallback, undefined !== '' enters the access branch, buildPrefixedRedisKey
		// throws on undefined.startsWith, the throw is swallowed by the outer catch, and
		// the cookie-clearing line below it never runs.
		const ctx = {
			state: { user: { refreshToken: 'myRefreshToken' } },
			cookies: { set: sinon.stub() }
		} as never
		const result = await logout.resolve(null, {}, ctx)

		expect(result).to.equal(true)
		const setCall = (ctx.cookies.set as sinon.SinonStub)
			.getCalls()
			.find((c) => c.args[0] === 'refresh_token')
		expect(setCall, 'refresh_token cookie must be cleared').to.exist
		expect(setCall?.args[1]).to.equal('')
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

	it('does not double-prefix a refresh token that already carries "refresh:"', async () => {
		// authenticatedLogoutHandler populates ctx.state.user.refreshToken already prefixed:
		// re-adding the prefix here deleted refresh:refresh:<uuid> and left the session alive.
		const ctx = makeCtx('refresh:myRefreshToken')
		await logout.resolve(null, {}, ctx)

		const keys = delStub.getCalls().map((c) => c.args[0] as string)
		expect(keys.some((k) => k.endsWith('refresh:myRefreshToken'))).to.equal(true)
		expect(keys.some((k) => k.includes('refresh:refresh:'))).to.equal(false)
	})

	it('does not double-prefix an access token that already carries "access:"', async () => {
		const ctx = makeCtx('refresh:refreshTok', 'access:accessTok')
		await logout.resolve(null, {}, ctx)

		const keys = delStub.getCalls().map((c) => c.args[0] as string)
		expect(keys.some((k) => k.endsWith('access:accessTok'))).to.equal(true)
		expect(keys.some((k) => k.includes('access:access:'))).to.equal(false)
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
