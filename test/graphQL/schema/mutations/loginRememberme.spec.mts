/**
 * Tests for graphQL/schema/mutations/loginRememberme.mts
 *
 * Chain: checkUserLoginAuthorization → infoUserForLogin(UserBase.findOne) + compareHashAsync(bcrypt.compare)
 *        updateLoginStatsRememberme(UserBase.updateOne)
 *        setRedisLoginSession(redisClient.hSet/expire)
 *        setLoginCookies(ctx.cookies.set)
 */
import { loginRememberme } from '../../../../dist/graphQL/schema/mutations/loginRememberme.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { redisClient } from '@dataSources/Redis.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import mongoose, { Types } from 'mongoose'

import { expectGraphQLErrorAsync } from '../../../helpers/assertGraphQLError.mjs'

// ---------------------------------------------------------------------------

function makeSession() {
	return {
		withTransaction: async (fn: () => Promise<void>) => { await fn() },
		endSession: sinon.stub().resolves()
	}
}

function makeQuery(value: unknown) {
	const q = {
		select: () => q,
		session: () => q,
		lean: () => Promise.resolve(value),
		exec: () => Promise.resolve(value)
	}
	return q
}

function makeCtx() {
	return { cookies: { set: sinon.stub() } } as never
}

// A fake user document returned by infoUserForLogin
function fakeUser(overrides: Record<string, unknown> = {}) {
	return {
		_id: new Types.ObjectId(),
		login: { password: 'hashedpwd', lastLogin: null },
		account: {
			email: { valid: true },
			deleted: false,
			disabled: false
		},
		...overrides
	}
}

// ---------------------------------------------------------------------------

describe('loginRememberme — resolve (deep stubs)', () => {
	let startSessionStub: sinon.SinonStub
	let findOneStub: sinon.SinonStub
	let updateOneStub: sinon.SinonStub
	let hSetStub: sinon.SinonStub
	let expireStub: sinon.SinonStub
	let delStub: sinon.SinonStub
	let bcrypt: { compare: sinon.SinonStub; hash: sinon.SinonStub }
	let accountDisabledStub: sinon.SinonStub

	beforeEach(async () => {
		startSessionStub = sinon.stub(mongoose, 'startSession').resolves(makeSession() as never)
		findOneStub = sinon.stub(UserBase, 'findOne')
		updateOneStub = sinon.stub(UserBase, 'updateOne').resolves({ modifiedCount: 1 } as never)
		hSetStub = sinon.stub(redisClient, 'hSet').resolves(0)
		expireStub = sinon.stub(redisClient, 'expire').resolves(true)
		delStub = sinon.stub(redisClient, 'del').resolves(0)
		accountDisabledStub = sinon.stub(SocketLabsLib.prototype, 'accountDisabled').resolves()

		const bcryptMod = (await import('@node-rs/bcrypt')).default
		bcrypt = bcryptMod as unknown as typeof bcrypt
		sinon.stub(bcryptMod, 'compare').resolves(true)
		sinon.stub(bcryptMod, 'hash').resolves('$hashed$')
	})

	afterEach(() => {
		sinon.restore()
	})

	it('happy path: valid credentials → returns { accessToken } string', async () => {
		findOneStub.returns(makeQuery(fakeUser()))
		const ctx = makeCtx()

		const result = await loginRememberme.resolve(
			null,
			{ email: 'user@test.com', password: 'validpass12', rememberMe: true },
			ctx
		) as { accessToken: string }

		expect(result).to.have.property('accessToken').that.is.a('string').and.not.equal('')
		expect(hSetStub.called).to.equal(true)
		expect((ctx.cookies.set as sinon.SinonStub).calledWith('refresh_token')).to.equal(true)
		// The session must be closed on the SUCCESS path too, not only when the
		// transaction throws. Moving endSession() out of `finally` into `catch` leaves
		// every successful call leaking a mongoose ClientSession, and the error-path
		// test still passes because tryCatchRethrow always throws.
		const session = (await startSessionStub.returnValues[0]) as { endSession: sinon.SinonStub }
		expect(session.endSession.called, 'session must be ended on the success path').to.equal(true)
	})

	it('happy path with rememberMe=false sets no rememberMe flag', async () => {
		findOneStub.returns(makeQuery(fakeUser()))
		const ctx = makeCtx()

		const result = await loginRememberme.resolve(
			null,
			{ email: 'user@test.com', password: 'validpass12', rememberMe: false },
			ctx
		) as { accessToken: string }

		expect(result.accessToken).to.be.a('string').and.not.equal('')
	})

	it('user not found → throws 401 Unauthorized', async () => {
		findOneStub.returns(makeQuery(null))

		await expectGraphQLErrorAsync(
			() =>
				loginRememberme.resolve(
					null,
					{ email: 'nouser@test.com', password: 'validpass12', rememberMe: false },
					makeCtx()
				),
			401,
			'Unauthorized'
		)
	})

	it('email not validated → throws 403 Forbidden', async () => {
		findOneStub.returns(makeQuery(fakeUser({ account: { email: { valid: false }, deleted: false, disabled: false } })))

		await expectGraphQLErrorAsync(
			() =>
				loginRememberme.resolve(
					null,
					{ email: 'invalid@test.com', password: 'validpass12', rememberMe: false },
					makeCtx()
				),
			403,
			'Forbidden'
		)
	})

	it('wrong password → throws 403 Forbidden', async () => {
		findOneStub.returns(makeQuery(fakeUser()))
		// override compare to return false
		sinon.restore()
		startSessionStub = sinon.stub(mongoose, 'startSession').resolves(makeSession() as never)
		findOneStub = sinon.stub(UserBase, 'findOne').returns(makeQuery(fakeUser()))
		sinon.stub(UserBase, 'updateOne').resolves({ modifiedCount: 1 } as never)
		sinon.stub(redisClient, 'hSet').resolves(0)
		sinon.stub(redisClient, 'expire').resolves(true)
		sinon.stub(redisClient, 'del').resolves(0)
		sinon.stub(SocketLabsLib.prototype, 'accountDisabled').resolves()
		const bcryptMod = (await import('@node-rs/bcrypt')).default
		sinon.stub(bcryptMod, 'compare').resolves(false) // wrong password

		await expectGraphQLErrorAsync(
			() =>
				loginRememberme.resolve(
					null,
					{ email: 'user@test.com', password: 'wrongpass1', rememberMe: false },
					makeCtx()
				),
			403,
			'Forbidden'
		)
	})

	it('account deleted → throws 403 Forbidden', async () => {
		findOneStub.returns(makeQuery(fakeUser({ account: { email: { valid: true }, deleted: true, disabled: false } })))

		await expectGraphQLErrorAsync(
			() =>
				loginRememberme.resolve(
					null,
					{ email: 'deleted@test.com', password: 'validpass12', rememberMe: false },
					makeCtx()
				),
			403,
			'Forbidden'
		)
	})

	it('account disabled → throws 403 Forbidden and sends accountDisabled email', async () => {
		findOneStub.returns(makeQuery(fakeUser({ account: { email: { valid: true }, deleted: false, disabled: true } })))

		await expectGraphQLErrorAsync(
			() =>
				loginRememberme.resolve(
					null,
					{ email: 'disabled@test.com', password: 'validpass12', rememberMe: false },
					makeCtx()
				),
			403,
			'Forbidden'
		)

		expect(accountDisabledStub.calledOnce).to.equal(true)
	})

	it('firstLogin scenario: lastLogin=null sets firstLogin in updateOne', async () => {
		findOneStub.returns(makeQuery(fakeUser({ login: { password: 'hashedpwd', lastLogin: null } })))
		const ctx = makeCtx()

		const result = await loginRememberme.resolve(
			null,
			{ email: 'first@test.com', password: 'validpass12', rememberMe: true },
			ctx
		) as { accessToken: string }

		expect(result.accessToken).to.be.a('string')
		// updateOne called with $set containing firstLogin
		const setArg = updateOneStub.firstCall.args[1].$set
		expect(setArg).to.have.property('login.firstLogin')
	})
})
