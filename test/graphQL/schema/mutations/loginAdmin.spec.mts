/**
 * Tests for graphQL/schema/mutations/loginAdmin.mts
 *
 * Uses UserAdminKoaUtils (private model) instead of UserBase.
 * Import the model at module level to avoid OverwriteModelError.
 */
import { loginAdmin } from '../../../../dist/graphQL/schema/mutations/loginAdmin.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { redisClient } from '@dataSources/Redis.mjs'
import UserAdminKoaUtils from '@private/graphQL/models/MongoDB/private/UserAdminKoaUtils.mjs'
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

function fakeAdminUser(overrides: Partial<{ account: object; login: object }> = {}) {
	return {
		_id: new Types.ObjectId(),
		login: { password: 'hashedpwd', lastLogin: null, ...((overrides.login as object | undefined) ?? {}) },
		account: {
			email: { valid: true },
			deleted: false,
			disabled: false,
			...((overrides.account as object | undefined) ?? {})
		}
	}
}

// ---------------------------------------------------------------------------

describe('loginAdmin — resolve (deep stubs)', () => {
	let startSessionStub: sinon.SinonStub
	let findOneStub: sinon.SinonStub
	let updateOneStub: sinon.SinonStub
	let hSetStub: sinon.SinonStub
	let expireStub: sinon.SinonStub
	let accountDisabledStub: sinon.SinonStub

	beforeEach(async () => {
		startSessionStub = sinon.stub(mongoose, 'startSession').resolves(makeSession() as never)
		findOneStub = sinon.stub(UserAdminKoaUtils, 'findOne')
		updateOneStub = sinon.stub(UserAdminKoaUtils, 'updateOne').resolves({ modifiedCount: 1 } as never)
		hSetStub = sinon.stub(redisClient, 'hSet').resolves(0)
		expireStub = sinon.stub(redisClient, 'expire').resolves(true)
		sinon.stub(redisClient, 'del').resolves(0)
		accountDisabledStub = sinon.stub(SocketLabsLib.prototype, 'accountDisabled').resolves()

		const bcryptMod = (await import('@node-rs/bcrypt')).default
		sinon.stub(bcryptMod, 'compare').resolves(true)
		sinon.stub(bcryptMod, 'hash').resolves('$hashed$')
	})

	afterEach(() => {
		sinon.restore()
	})

	it('happy path: admin login → returns { accessToken }', async () => {
		findOneStub.returns(makeQuery(fakeAdminUser()))
		const ctx = makeCtx()

		const result = await loginAdmin.resolve(
			null,
			{ email: 'admin@test.com', password: 'adminpass12', rememberMe: false },
			ctx
		) as { accessToken: string }

		expect(result).to.have.property('accessToken').that.is.a('string').and.not.equal('')
		expect(hSetStub.called).to.equal(true)
		expect((ctx.cookies.set as sinon.SinonStub).calledWith('refresh_token')).to.equal(true)
	})

	it('admin not found → throws 401 Unauthorized', async () => {
		findOneStub.returns(makeQuery(null))

		await expectGraphQLErrorAsync(
			() =>
				loginAdmin.resolve(
					null,
					{ email: 'noone@test.com', password: 'adminpass12', rememberMe: false },
					makeCtx()
				),
			401,
			'Unauthorized'
		)
	})

	it('email not validated → throws 403 Forbidden', async () => {
		findOneStub.returns(makeQuery(fakeAdminUser({ account: { email: { valid: false }, deleted: false, disabled: false } })))

		await expectGraphQLErrorAsync(
			() =>
				loginAdmin.resolve(
					null,
					{ email: 'admin@test.com', password: 'adminpass12', rememberMe: false },
					makeCtx()
				),
			403,
			'Forbidden'
		)
	})

	it('wrong password → throws 403 Forbidden', async () => {
		findOneStub.returns(makeQuery(fakeAdminUser()))
		sinon.restore()
		// re-set up with compare=false
		sinon.stub(mongoose, 'startSession').resolves(makeSession() as never)
		sinon.stub(UserAdminKoaUtils, 'findOne').returns(makeQuery(fakeAdminUser()))
		sinon.stub(UserAdminKoaUtils, 'updateOne').resolves({ modifiedCount: 1 } as never)
		sinon.stub(redisClient, 'hSet').resolves(0)
		sinon.stub(redisClient, 'expire').resolves(true)
		sinon.stub(redisClient, 'del').resolves(0)
		sinon.stub(SocketLabsLib.prototype, 'accountDisabled').resolves()
		const bcryptMod = (await import('@node-rs/bcrypt')).default
		sinon.stub(bcryptMod, 'compare').resolves(false)

		await expectGraphQLErrorAsync(
			() =>
				loginAdmin.resolve(
					null,
					{ email: 'admin@test.com', password: 'wrongpass1', rememberMe: false },
					makeCtx()
				),
			403,
			'Forbidden'
		)
	})

	it('account deleted → throws 403 Forbidden', async () => {
		findOneStub.returns(makeQuery(fakeAdminUser({ account: { email: { valid: true }, deleted: true, disabled: false } })))

		await expectGraphQLErrorAsync(
			() =>
				loginAdmin.resolve(
					null,
					{ email: 'deleted@test.com', password: 'adminpass12', rememberMe: false },
					makeCtx()
				),
			403,
			'Forbidden'
		)
	})

	it('account disabled → throws 403 Forbidden and sends accountDisabled email', async () => {
		findOneStub.returns(makeQuery(fakeAdminUser({ account: { email: { valid: true }, deleted: false, disabled: true } })))

		await expectGraphQLErrorAsync(
			() =>
				loginAdmin.resolve(
					null,
					{ email: 'disabled@test.com', password: 'adminpass12', rememberMe: false },
					makeCtx()
				),
			403,
			'Forbidden'
		)

		expect(accountDisabledStub.calledOnce).to.equal(true)
	})

	it('rememberMe=true sets rememberMe in updateOne $set', async () => {
		findOneStub.returns(makeQuery(fakeAdminUser()))
		const ctx = makeCtx()

		await loginAdmin.resolve(
			null,
			{ email: 'admin@test.com', password: 'adminpass12', rememberMe: true },
			ctx
		)

		const setArg = updateOneStub.firstCall.args[1].$set
		expect(setArg).to.have.property('account.rememberMe', true)
	})

	it('firstLogin scenario: lastLogin=null sets firstLogin', async () => {
		findOneStub.returns(makeQuery(fakeAdminUser({ login: { password: 'hashedpwd', lastLogin: null } })))
		const ctx = makeCtx()

		const result = await loginAdmin.resolve(
			null,
			{ email: 'admin@test.com', password: 'adminpass12', rememberMe: false },
			ctx
		) as { accessToken: string }

		expect(result.accessToken).to.be.a('string').and.not.equal('')
		const setArg = updateOneStub.firstCall.args[1].$set
		expect(setArg).to.have.property('login.firstLogin')
	})
})
