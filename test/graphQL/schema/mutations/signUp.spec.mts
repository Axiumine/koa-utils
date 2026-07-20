/**
 * Tests for graphQL/schema/mutations/signUp.mts
 *
 * signUp imports: userExist (via UserBase.findOne), registerNewUser (via UserBase.create +
 * encryptPassword/bcrypt.hash), SocketLabsLib, mongoose.startSession.
 * Since local ESM named exports are non-stubbable, we stub the underlying Mongoose model
 * methods and bcrypt default import.
 */
import { signUp } from '../../../../dist/graphQL/schema/mutations/signUp.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import mongoose from 'mongoose'

import { expectGraphQLErrorAsync } from '../../../helpers/assertGraphQLError.mjs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a minimal mongoose-session-like double */
function makeSession() {
	const session = {
		withTransaction: async (fn: () => Promise<void>) => { await fn() },
		endSession: sinon.stub().resolves()
	}
	return session
}

/** Returns a chainable query double that resolves to `value` */
function makeQuery(value: unknown) {
	const q = {
		select: () => q,
		session: () => q,
		lean: () => Promise.resolve(value),
		exec: () => Promise.resolve(value)
	}
	return q
}

// ---------------------------------------------------------------------------

describe('signUp — resolve (deep stubs)', () => {
	let startSessionStub: sinon.SinonStub
	let findOneStub: sinon.SinonStub
	let createStub: sinon.SinonStub
	let emailAlreadyValidStub: sinon.SinonStub
	let sendEmailVerifyStub: sinon.SinonStub
	let bcryptHashStub: sinon.SinonStub

	beforeEach(async () => {
		// default import → configurable → sinon can stub it
		startSessionStub = sinon.stub(mongoose, 'startSession').resolves(makeSession() as never)
		findOneStub = sinon.stub(UserBase, 'findOne')
		createStub = sinon.stub(UserBase, 'create').resolves([] as never)
		emailAlreadyValidStub = sinon.stub(SocketLabsLib.prototype, 'emailAlreadyValid').resolves()
		sendEmailVerifyStub = sinon.stub(SocketLabsLib.prototype, 'sendEmailVerify').resolves()

		// bcrypt.hash used inside encryptPassword (CJS default import — stubbable)
		const bcrypt = (await import('@node-rs/bcrypt')).default
		bcryptHashStub = sinon.stub(bcrypt, 'hash').resolves('$hashed$')
	})

	afterEach(() => {
		sinon.restore()
	})

	it('happy path: new user → returns true, creates user, sends verify email', async () => {
		// userExist: findOne returns null → uExist = false
		findOneStub.returns(makeQuery(null))

		const result = await signUp.resolve(null, { email: 'New@Test.com', password: 'validpass12' })

		expect(result).to.equal(true)
		expect(createStub.calledOnce).to.equal(true)
		expect(sendEmailVerifyStub.calledOnce).to.equal(true)
		// email should be lowercased + trimmed
		expect(sendEmailVerifyStub.firstCall.args[0]).to.equal('new@test.com')
		expect(emailAlreadyValidStub.called).to.equal(false)
		// The session must be closed on the SUCCESS path too, not only when the
		// transaction throws. Moving endSession() out of `finally` into `catch` leaves
		// every successful call leaking a mongoose ClientSession, and the error-path
		// test still passes because tryCatchRethrow always throws.
		const session = (await startSessionStub.returnValues[0]) as { endSession: sinon.SinonStub }
		expect(session.endSession.called, 'session must be ended on the success path').to.equal(true)
	})

	it('existing user → throws 409 Conflict and sends emailAlreadyValid email', async () => {
		// userExist: findOne returns a doc → uExist = true
		findOneStub.returns(makeQuery({ _id: 'uid1' }))

		await expectGraphQLErrorAsync(
			() => signUp.resolve(null, { email: 'exists@test.com', password: 'validpass12' }),
			409,
			'Conflict'
		)

		expect(emailAlreadyValidStub.calledOnce).to.equal(true)
		expect(createStub.called).to.equal(false)
	})

	it('endSession called even when inner transaction throws', async () => {
		const session = makeSession()
		startSessionStub.resolves(session as never)
		findOneStub.returns(makeQuery({ _id: 'uid1' }))

		await expectGraphQLErrorAsync(
			() => signUp.resolve(null, { email: 'x@x.com', password: 'validpass12' }),
			409,
			'Conflict'
		)

		expect((session.endSession as sinon.SinonStub).calledOnce).to.equal(true)
	})
})
