/**
 * Tests for graphQL/schema/mutations/resetPwd.mts
 *
 * resetPwd uses getResetPwd (→ UserBase.findOne), saveResetReq (→ UserBase.updateOne),
 * SocketLabsLib.sendEmailReset, DateLib.minElapsed, StringLib.randomString.
 * Branches:
 *   - email not in DB (resetPwdVal === null) → returns true silently
 *   - no prior request (resetDateReq undefined) → calculateHash=true → saves hash, sends email
 *   - prior request < 10 min → throws 429 Too Many Requests
 *   - prior request >= 10 min → calculateHash=true → saves hash, sends email
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
			email: { hash: 'existingHash' }
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

	it('prior request >= 10 min ago → recalculates hash and resends email', async () => {
		// 15 minutes ago
		const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000)
		findOneStub.returns(makeQuery(fakeResetPwdVal(fifteenMinsAgo)))

		const result = await resetPwd.resolve(null, { email: 'user@test.com' })

		expect(result).to.equal(true)
		expect(updateOneStub.calledOnce).to.equal(true)
		expect(sendEmailResetStub.calledOnce).to.equal(true)
	})

	it('prior request < 10 min ago → throws 429 Too Many Requests', async () => {
		// 3 minutes ago
		const threeMinsAgo = new Date(Date.now() - 3 * 60 * 1000)
		findOneStub.returns(makeQuery(fakeResetPwdVal(threeMinsAgo)))

		await expectGraphQLErrorAsync(
			() => resetPwd.resolve(null, { email: 'user@test.com' }),
			429,
			'Too Many Requests'
		)

		expect(sendEmailResetStub.called).to.equal(false)
	})

	it('prior request exactly at boundary (0 min elapsed) → throws 429', async () => {
		// just now
		const justNow = new Date()
		findOneStub.returns(makeQuery(fakeResetPwdVal(justNow)))

		await expectGraphQLErrorAsync(
			() => resetPwd.resolve(null, { email: 'user@test.com' }),
			429,
			'Too Many Requests'
		)
	})

	it('endSession is called in finally even when throw', async () => {
		const session = makeSession()
		startSessionStub.resolves(session as never)
		const justNow = new Date()
		findOneStub.returns(makeQuery(fakeResetPwdVal(justNow)))

		await expectGraphQLErrorAsync(
			() => resetPwd.resolve(null, { email: 'user@test.com' }),
			429,
			'Too Many Requests'
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
