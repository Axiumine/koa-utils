/**
 * Tests for graphQL/schema/mutations/resetPwd.mts
 *
 * resetPwd uses getResetPwd (→ UserBase.findOne), saveResetReq (→ UserBase.updateOne),
 * SocketLabsLib.sendEmailReset, DateLib.minElapsed, StringLib.randomString.
 * Branches:
 *   - email not in DB (resetPwdVal === null) → returns true silently
 *   - no prior request (resetDateReq undefined) → calculateHash=true → saves hash, sends email
 *   - prior request < 10 min → returns true silently, writes nothing, sends nothing
 *   - prior request >= 10 min → calculateHash=true → saves hash, sends email
 *
 * Every path returns true. The mutation must never let an unauthenticated caller distinguish
 * "unknown address" from "registered address, reset already pending" — not by status, not by
 * response time, which is why the email is queued after the commit and never awaited.
 */
import { resetPwd } from '../../../../dist/graphQL/schema/mutations/resetPwd.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
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

/**
 * mongoose's session.withTransaction re-runs its callback on a transient error. Anything with a
 * side effect outside the database must therefore sit outside the callback.
 */
function makeRetryingSession() {
	return {
		withTransaction: async (fn: () => Promise<void>) => { await fn(); await fn() },
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

/** A minimal UserBase row as getResetPwd would return */
function fakeResetPwdVal(resetDateReq?: Date) {
	return {
		_id: new Types.ObjectId(),
		personalData: { name: 'Test User' },
		account: {
			resetDateReq,
			resetHash: 'existingHash'
		}
	}
}

// ---------------------------------------------------------------------------

describe('resetPwd — resolve', () => {
	let startSessionStub: sinon.SinonStub
	let findOneStub: sinon.SinonStub
	let updateOneStub: sinon.SinonStub
	let sendEmailResetStub: sinon.SinonStub

	beforeEach(() => {
		startSessionStub = sinon.stub(mongoose, 'startSession').resolves(makeSession() as never)
		findOneStub = sinon.stub(UserBase, 'findOne')
		updateOneStub = sinon.stub(UserBase, 'updateOne').resolves({ modifiedCount: 1 } as never)
		sendEmailResetStub = sinon.stub(SocketLabsLib.prototype, 'sendEmailReset').resolves()
	})

	afterEach(() => {
		sinon.restore()
	})

	it('email not in DB (null result) → returns true silently without sending email', async () => {
		findOneStub.returns(makeQuery(null))

		const result = await resetPwd.resolve(null, { email: 'unknown@test.com' })

		expect(result).to.equal(true)
		expect(sendEmailResetStub.called).to.equal(false)
		expect(updateOneStub.called).to.equal(false)
	})

	it('first-ever reset request (no resetDateReq) → saves hash and sends reset email', async () => {
		// resetDateReq undefined → calculateHash = true
		findOneStub.returns(makeQuery(fakeResetPwdVal(undefined)))

		const result = await resetPwd.resolve(null, { email: 'user@test.com' })

		expect(result).to.equal(true)
		expect(updateOneStub.calledOnce).to.equal(true)
		expect(sendEmailResetStub.calledOnce).to.equal(true)
		expect(sendEmailResetStub.firstCall.args[0]).to.equal('user@test.com')
	})

	it('SECURITY: a reset request leaves a pending email verification intact', async () => {
		// resetPwd is unauthenticated — anyone knowing an address can call it. While the reset token
		// lived in account.email.hash, that single call overwrote a pending activation or
		// email-change hash, silently breaking the link already in the victim's inbox. Each click on
		// the dead link then incremented account.email.requestTimes, and at 5
		// handleIfTooMuchRequestsTimes deleted the account outright.
		findOneStub.returns(makeQuery(fakeResetPwdVal(undefined)))

		await resetPwd.resolve(null, { email: 'user@test.com' })

		const written = Object.keys(updateOneStub.firstCall.args[1].$set)
		expect(written).to.include('account.resetHash')
		expect(written.filter((p) => p.startsWith('account.email.'))).to.deep.equal([])
	})

	it('prior request >= 10 min ago → recalculates hash and resends email', async () => {
		// 15 minutes ago
		const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000)
		findOneStub.returns(makeQuery(fakeResetPwdVal(fifteenMinsAgo)))

		const result = await resetPwd.resolve(null, { email: 'user@test.com' })

		expect(result).to.equal(true)
		expect(updateOneStub.calledOnce).to.equal(true)
		expect(sendEmailResetStub.calledOnce).to.equal(true)
		// The session must be closed on the SUCCESS path too, not only when the
		// transaction throws. Moving endSession() out of `finally` into `catch` leaves
		// every successful call leaking a mongoose ClientSession, and the error-path
		// test still passes because tryCatchRethrow always throws.
		const session = (await startSessionStub.returnValues[0]) as { endSession: sinon.SinonStub }
		expect(session.endSession.called, 'session must be ended on the success path').to.equal(true)
	})

	it('prior request < 10 min ago → returns true, writes nothing, sends nothing', async () => {
		// 3 minutes ago
		const threeMinsAgo = new Date(Date.now() - 3 * 60 * 1000)
		findOneStub.returns(makeQuery(fakeResetPwdVal(threeMinsAgo)))

		const result = await resetPwd.resolve(null, { email: 'user@test.com' })

		expect(result).to.equal(true)
		expect(sendEmailResetStub.called, 'the throttle must still suppress the email').to.equal(false)
		expect(updateOneStub.called, 'no new hash may be written while throttled').to.equal(false)
	})

	it('prior request exactly at boundary (0 min elapsed) → returns true, sends nothing', async () => {
		// just now
		const justNow = new Date()
		findOneStub.returns(makeQuery(fakeResetPwdVal(justNow)))

		const result = await resetPwd.resolve(null, { email: 'user@test.com' })

		expect(result).to.equal(true)
		expect(sendEmailResetStub.called).to.equal(false)
	})

	it('SECURITY: a throttled request is indistinguishable from an unknown address', async () => {
		// This path used to throw 429 with the remaining wait time. That answer only ever reached a
		// caller whose address was registered AND had a reset pending, while an unknown address got
		// true — an enumeration oracle on an unauthenticated mutation. The throttle itself is kept
		// (no write, no email); only the disclosure is gone.
		const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000)
		findOneStub.returns(makeQuery(fakeResetPwdVal(twoMinsAgo)))
		const throttled = await resetPwd.resolve(null, { email: 'registered@test.com' })

		findOneStub.returns(makeQuery(null))
		const unknown = await resetPwd.resolve(null, { email: 'unknown@test.com' })

		expect(throttled).to.equal(unknown)
		expect(sendEmailResetStub.called, 'neither case may send an email').to.equal(false)
		expect(updateOneStub.called, 'neither case may write').to.equal(false)
	})

	it('SECURITY: the send is not awaited, so a slow mail provider cannot time the response', async () => {
		// Awaiting the SocketLabs round-trip made a "registered, not throttled" request measurably
		// slower than an unknown-address one — the same fact the removed 429 used to state outright.
		// A send that never settles must not hold up the resolver: if this ever goes back to being
		// awaited, this test times out instead of passing.
		findOneStub.returns(makeQuery(fakeResetPwdVal(undefined)))
		sendEmailResetStub.returns(new Promise(() => { /* never settles */ }))

		const result = await resetPwd.resolve(null, { email: 'user@test.com' })

		expect(result).to.equal(true)
		expect(sendEmailResetStub.calledOnce, 'the send must still have been started').to.equal(true)
	})

	it('a rejected send is swallowed: still returns true, no unhandled rejection', async () => {
		// The caller must not learn that delivery failed — a SocketLabs outage surfacing as a 500
		// would again be an answer only a registered address could ever receive. Sentry gets it.
		findOneStub.returns(makeQuery(fakeResetPwdVal(undefined)))
		sendEmailResetStub.rejects(new Error('socketlabs down'))

		const result = await resetPwd.resolve(null, { email: 'user@test.com' })
		// let the detached .catch() run before the test ends
		await new Promise((resolve) => setImmediate(resolve))

		expect(result).to.equal(true)
	})

	it('a synchronous throw from the send path is swallowed too', async () => {
		// Covers the guard around the SocketLabsLib construction: anything that throws before a
		// promise exists would otherwise escape the resolver unwrapped, past tryCatchRethrow.
		findOneStub.returns(makeQuery(fakeResetPwdVal(undefined)))
		sendEmailResetStub.throws(new Error('bad config'))

		const result = await resetPwd.resolve(null, { email: 'user@test.com' })

		expect(result).to.equal(true)
	})

	it('a retried transaction saves twice but mails once', async () => {
		// withTransaction re-runs its callback on a transient error. While the send lived inside the
		// callback, a retried commit mailed the user a second link, which silently invalidated the
		// first one they had already clicked.
		startSessionStub.resolves(makeRetryingSession() as never)
		findOneStub.returns(makeQuery(fakeResetPwdVal(undefined)))

		const result = await resetPwd.resolve(null, { email: 'user@test.com' })

		expect(result).to.equal(true)
		expect(updateOneStub.callCount, 'the callback itself ran twice').to.equal(2)
		expect(sendEmailResetStub.callCount, 'only one link may reach the user').to.equal(1)
	})

	it('endSession is called in finally even when throw', async () => {
		const session = makeSession()
		startSessionStub.resolves(session as never)
		findOneStub.returns(makeQuery(fakeResetPwdVal(undefined)))
		// saveResetReq rejects → tryCatchRethrow turns a plain Error into 500 and rethrows,
		// so the finally block is the only thing that can still close the session.
		updateOneStub.rejects(new Error('db down'))

		await expectGraphQLErrorAsync(
			() => resetPwd.resolve(null, { email: 'user@test.com' }),
			500,
			'Internal Server Error'
		)

		expect((session.endSession as sinon.SinonStub).calledOnce).to.equal(true)
	})

	it('email is lowercased before lookup', async () => {
		findOneStub.returns(makeQuery(null))

		await resetPwd.resolve(null, { email: 'UPPER@TEST.COM' })

		// getResetPwd calls findOne with lowercased email
		// The query arg [0] is the filter object
		const filterArg = findOneStub.firstCall.args[0] as Record<string, string>
		expect(filterArg['login.email']).to.equal('upper@test.com')
	})
})
