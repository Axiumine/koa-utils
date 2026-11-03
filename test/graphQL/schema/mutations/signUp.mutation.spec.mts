/**
 * Mutation-testing guards for graphQL/schema/mutations/signUp.mts
 *
 * Pin: arg schema types, email trimmed before lookup AND before mail.
 */
import { signUp } from '../../../../dist/graphQL/schema/mutations/signUp.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import mongoose from 'mongoose'

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

describe('signUp — mutation guards', () => {
	afterEach(() => {
		sinon.restore()
	})

	it('declares email + password as non-null scalars, nothing else', () => {
		expect(Object.keys(signUp.args).sort()).to.deep.equal(['email', 'password'])
		expect(signUp.args.email.type.toString()).to.equal('String!')
		expect(signUp.args.password.type.toString()).to.equal('String!')
	})

	it('trims + lowercases the email before lookup, create and mail', async () => {
		sinon.stub(mongoose, 'startSession').resolves(makeSession() as never)
		const findOneStub = sinon.stub(UserBase, 'findOne').returns(makeQuery(null) as never)
		sinon.stub(UserBase, 'create').resolves([] as never)
		const sendEmailVerifyStub = sinon.stub(SocketLabsLib.prototype, 'sendEmailVerify').resolves()
		const bcrypt = (await import('@node-rs/bcrypt')).default
		sinon.stub(bcrypt, 'hash').resolves('$hashed$')

		await signUp.resolve(null, { email: '  Padded@Test.COM \t', password: 'validpass12' })

		expect(findOneStub.firstCall.args[0]).to.deep.equal({ 'login.email': 'padded@test.com' })
		expect(sendEmailVerifyStub.firstCall.args[0]).to.equal('padded@test.com')
	})
})
