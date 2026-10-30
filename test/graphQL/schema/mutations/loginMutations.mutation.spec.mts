/**
 * Mutation-testing guards for login4Ever / loginAdmin / loginRememberme.
 *
 * 3 resolvers share 1 shape → 1 table-driven spec. Each case pin 1 survivor of Stryker:
 * arg schema types, email normalisation, `checkPwdLen` call, `accessToken` initial value,
 * `Sentry.captureException` in catch.
 */
import { login4Ever } from '../../../../dist/graphQL/schema/mutations/login4Ever.mjs'
import { loginAdmin } from '../../../../dist/graphQL/schema/mutations/loginAdmin.mjs'
import { loginRememberme } from '../../../../dist/graphQL/schema/mutations/loginRememberme.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { redisClient } from '@dataSources/Redis.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import UserAdminKoaUtils from '@private/graphQL/models/MongoDB/private/UserAdminKoaUtils.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import mongoose, { Types } from 'mongoose'

import { expectGraphQLErrorAsync } from '../../../helpers/assertGraphQLError.mjs'
import { ISentryProbe, startSentryProbe } from '../../../helpers/sentryProbeS2.mjs'

interface ILoginCase {
	name: string
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	mutation: any
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	model: any
	extraArgs: Record<string, unknown>
	argNames: string[]
}

const cases: ILoginCase[] = [
	{ name: 'login4Ever', mutation: login4Ever, model: UserBase, extraArgs: {}, argNames: ['email', 'password'] },
	{
		name: 'loginAdmin',
		mutation: loginAdmin,
		model: UserAdminKoaUtils,
		extraArgs: { rememberMe: false },
		argNames: ['email', 'password', 'rememberMe']
	},
	{
		name: 'loginRememberme',
		mutation: loginRememberme,
		model: UserBase,
		extraArgs: { rememberMe: true },
		argNames: ['email', 'password', 'rememberMe']
	}
]

function makeSession() {
	return {
		withTransaction: async (fn: () => Promise<void>) => {
			await fn()
		},
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

function fakeUser() {
	return {
		_id: new Types.ObjectId(),
		login: { password: 'hashedpwd', lastLogin: null },
		account: { email: { valid: true }, deleted: false, disabled: false }
	}
}

function makeCtx() {
	return { cookies: { set: sinon.stub() } } as never
}

for (const c of cases) {
	describe(`${c.name} — mutation guards`, () => {
		let startSessionStub: sinon.SinonStub
		let findOneStub: sinon.SinonStub
		let probe: ISentryProbe

		beforeEach(async () => {
			startSessionStub = sinon.stub(mongoose, 'startSession').resolves(makeSession() as never)
			findOneStub = sinon.stub(c.model, 'findOne')
			sinon.stub(c.model, 'updateOne').resolves({ modifiedCount: 1 } as never)
			sinon.stub(redisClient, 'hSet').resolves(0)
			sinon.stub(redisClient, 'expire').resolves(true)
			sinon.stub(redisClient, 'del').resolves(0)
			sinon.stub(SocketLabsLib.prototype, 'accountDisabled').resolves()
			const bcryptMod = (await import('@node-rs/bcrypt')).default
			sinon.stub(bcryptMod, 'compare').resolves(true)
			sinon.stub(bcryptMod, 'hash').resolves('$hashed$')
			probe = await startSentryProbe()
		})

		afterEach(async () => {
			await probe.stop()
			sinon.restore()
		})

		it('declares every arg as a non-null scalar', () => {
			expect(Object.keys(c.mutation.args).sort()).to.deep.equal([...c.argNames].sort())
			expect(c.mutation.args.email.type.toString()).to.equal('String!')
			expect(c.mutation.args.password.type.toString()).to.equal('String!')
		})

		it('trims + lowercases the email before the lookup', async () => {
			findOneStub.returns(makeQuery(fakeUser()))

			await c.mutation.resolve(null, { email: '  USER@Test.COM \t', password: 'validpass12', ...c.extraArgs }, makeCtx())

			expect(findOneStub.calledOnce).to.equal(true)
			expect(Object.values(findOneStub.firstCall.args[0])).to.deep.equal(['user@test.com'])
		})

		it('rejects a too-short password with 400 before any session is opened', async () => {
			await expectGraphQLErrorAsync(
				() => c.mutation.resolve(null, { email: 'a@b.it', password: '1', ...c.extraArgs }, makeCtx()),
				400,
				'Bad Request',
				'Password is too short'
			)
			expect(startSessionStub.called).to.equal(false)
		})

		it('returns an empty accessToken when the transaction body never ran', async () => {
			startSessionStub.resolves({
				withTransaction: async () => undefined,
				endSession: sinon.stub().resolves()
			} as never)

			const result = await c.mutation.resolve(null, { email: 'a@b.it', password: 'validpass12', ...c.extraArgs }, makeCtx())

			expect(result).to.deep.equal({ accessToken: '' })
		})

		it('reports a failed login (GraphQLError) to Sentry exactly once', async () => {
			findOneStub.returns(makeQuery(null))

			await expectGraphQLErrorAsync(
				() => c.mutation.resolve(null, { email: 'no@test.com', password: 'validpass12', ...c.extraArgs }, makeCtx()),
				401,
				'Unauthorized'
			)
			await probe.flush()

			expect(probe.texts()).to.deep.equal(['Unauthorized'])
		})
	})
}
