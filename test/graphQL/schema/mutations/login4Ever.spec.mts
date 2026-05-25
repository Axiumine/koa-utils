/**
 * Tests for graphQL/schema/mutations/login4Ever.mts
 *
 * Identical chain to loginRememberme but no rememberMe flag and uses updateLoginStats4ever.
 */
import { login4Ever } from '../../../../dist/graphQL/schema/mutations/login4Ever.mjs'
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

function fakeUser(overrides: Partial<{ account: object; login: object }> = {}) {
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

describe('login4Ever — resolve (deep stubs)', () => {
	let startSessionStub: sinon.SinonStub
	let findOneStub: sinon.SinonStub
	let updateOneStub: sinon.SinonStub
	let hSetStub: sinon.SinonStub
	let accountDisabledStub: sinon.SinonStub

	beforeEach(async () => {
		startSessionStub = sinon.stub(mongoose, 'startSession').resolves(makeSession() as never)
		findOneStub = sinon.stub(UserBase, 'findOne')
		updateOneStub = sinon.stub(UserBase, 'updateOne').resolves({ modifiedCount: 1 } as never)
		hSetStub = sinon.stub(redisClient, 'hSet').resolves(0)
		sinon.stub(redisClient, 'expire').resolves(true)
		sinon.stub(redisClient, 'del').resolves(0)
		accountDisabledStub = sinon.stub(SocketLabsLib.prototype, 'accountDisabled').resolves()

		const bcryptMod = (await import('@node-rs/bcrypt')).default
		sinon.stub(bcryptMod, 'compare').resolves(true)
	})

	afterEach(() => {
		sinon.restore()
	})

	it('happy path: valid credentials → returns { accessToken } string', async () => {
		findOneStub.returns(makeQuery(fakeUser()))
		const ctx = makeCtx()

		const result = await login4Ever.resolve(
			null,
			{ email: 'user@test.com', password: 'validpass12' },
			ctx
		) as { accessToken: string }

		expect(result).to.have.property('accessToken').that.is.a('string').and.not.equal('')
		expect(hSetStub.called).to.equal(true)
		expect((ctx.cookies.set as sinon.SinonStub).calledWith('refresh_token')).to.equal(true)
	})

	it('user not found → throws 401 Unauthorized', async () => {
		findOneStub.returns(makeQuery(null))

		await expectGraphQLErrorAsync(
			() => login4Ever.resolve(null, { email: 'no@test.com', password: 'validpass12' }, makeCtx()),
			401,
			'Unauthorized'
		)
	})

	it('email not validated → throws 403 Forbidden', async () => {
		findOneStub.returns(makeQuery(fakeUser({ account: { email: { valid: false }, deleted: false, disabled: false } })))

		await expectGraphQLErrorAsync(
			() => login4Ever.resolve(null, { email: 'u@test.com', password: 'validpass12' }, makeCtx()),
			403,
			'Forbidden'
		)
	})

	it('wrong password → throws 403 Forbidden', async () => {
		findOneStub.returns(makeQuery(fakeUser()))
		sinon.restore()
		sinon.stub(mongoose, 'startSession').resolves(makeSession() as never)
		sinon.stub(UserBase, 'findOne').returns(makeQuery(fakeUser()))
		sinon.stub(UserBase, 'updateOne').resolves({ modifiedCount: 1 } as never)
		sinon.stub(redisClient, 'hSet').resolves(0)
		sinon.stub(redisClient, 'expire').resolves(true)
		sinon.stub(redisClient, 'del').resolves(0)
		sinon.stub(SocketLabsLib.prototype, 'accountDisabled').resolves()
		const bcryptMod = (await import('@node-rs/bcrypt')).default
		sinon.stub(bcryptMod, 'compare').resolves(false)

		await expectGraphQLErrorAsync(
			() => login4Ever.resolve(null, { email: 'u@test.com', password: 'wrongpass1' }, makeCtx()),
			403,
			'Forbidden'
		)
	})

	it('account deleted → throws 403 Forbidden', async () => {
		findOneStub.returns(makeQuery(fakeUser({ account: { email: { valid: true }, deleted: true, disabled: false } })))

		await expectGraphQLErrorAsync(
			() => login4Ever.resolve(null, { email: 'del@test.com', password: 'validpass12' }, makeCtx()),
			403,
			'Forbidden'
		)
	})

	it('account disabled → throws 403 Forbidden and sends accountDisabled email', async () => {
		findOneStub.returns(makeQuery(fakeUser({ account: { email: { valid: true }, deleted: false, disabled: true } })))

		await expectGraphQLErrorAsync(
			() => login4Ever.resolve(null, { email: 'dis@test.com', password: 'validpass12' }, makeCtx()),
			403,
			'Forbidden'
		)
		expect(accountDisabledStub.calledOnce).to.equal(true)
	})

	it('firstLogin scenario: lastLogin=null sets firstLogin in updateOne', async () => {
		findOneStub.returns(makeQuery(fakeUser({ login: { password: 'hashedpwd', lastLogin: null } })))
		const ctx = makeCtx()

		const result = await login4Ever.resolve(
			null,
			{ email: 'first@test.com', password: 'validpass12' },
			ctx
		) as { accessToken: string }

		expect(result.accessToken).to.be.a('string').and.not.equal('')
		const setArg = updateOneStub.firstCall.args[1].$set
		expect(setArg).to.have.property('login.firstLogin')
	})

	it('existing lastLogin: only lastLogin updated in updateOne', async () => {
		findOneStub.returns(makeQuery(fakeUser({ login: { password: 'hashedpwd', lastLogin: new Date('2024-01-01') } })))

		const result = await login4Ever.resolve(
			null,
			{ email: 'old@test.com', password: 'validpass12' },
			makeCtx()
		) as { accessToken: string }

		expect(result.accessToken).to.be.a('string')
		const setArg = updateOneStub.firstCall.args[1].$set
		expect(setArg).to.not.have.property('login.firstLogin')
		expect(setArg).to.have.property('login.lastLogin')
	})
})
