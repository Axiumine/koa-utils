/**
 * Tests for lib/access/verifyEmailMailer.mts
 *
 * What is pinned here: socketLabsVerifyEmailMailer forwards each of the six methods to the matching
 * SocketLabs template, with the arguments untouched. A wrong mapping here sends the wrong copy from every
 * guard at once.
 */
import { defaultVerifyEmailMailer, socketLabsVerifyEmailMailer } from '@lib/access/verifyEmailMailer.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

// ---------------------------------------------------------------------------

describe('socketLabsVerifyEmailMailer', () => {
	afterEach(() => sinon.restore())

	it('forwards every method to the SocketLabs template of the same name', async () => {
		const stubs = {
			emailAlreadyValid: sinon.stub(SocketLabsLib.prototype, 'emailAlreadyValid').resolves(),
			wrongHash: sinon.stub(SocketLabsLib.prototype, 'wrongHash').resolves(),
			tooMuchVerifyRequests: sinon.stub(SocketLabsLib.prototype, 'tooMuchVerifyRequests').resolves(),
			hashReqTooOld: sinon.stub(SocketLabsLib.prototype, 'hashReqTooOld').resolves(),
			accountDisabled: sinon.stub(SocketLabsLib.prototype, 'accountDisabled').resolves(),
			sendWelcome: sinon.stub(SocketLabsLib.prototype, 'sendWelcome').resolves()
		}

		await socketLabsVerifyEmailMailer.emailAlreadyValid('a@test.com')
		await socketLabsVerifyEmailMailer.wrongHash('b@test.com', 3)
		await socketLabsVerifyEmailMailer.tooMuchVerifyRequests('c@test.com')
		await socketLabsVerifyEmailMailer.hashReqTooOld('d@test.com')
		await socketLabsVerifyEmailMailer.accountDisabled('e@test.com')
		await socketLabsVerifyEmailMailer.sendWelcome('f@test.com')

		expect(stubs.emailAlreadyValid.calledOnceWithExactly('a@test.com')).to.equal(true)
		expect(stubs.wrongHash.calledOnceWithExactly('b@test.com', 3)).to.equal(true)
		expect(stubs.tooMuchVerifyRequests.calledOnceWithExactly('c@test.com')).to.equal(true)
		expect(stubs.hashReqTooOld.calledOnceWithExactly('d@test.com')).to.equal(true)
		expect(stubs.accountDisabled.calledOnceWithExactly('e@test.com')).to.equal(true)
		expect(stubs.sendWelcome.calledOnceWithExactly('f@test.com')).to.equal(true)
	})

	it('returns what the SocketLabs client returns', async () => {
		sinon.stub(SocketLabsLib.prototype, 'sendWelcome').resolves(true as never)

		expect(await socketLabsVerifyEmailMailer.sendWelcome('f@test.com')).to.equal(true)
	})
})

describe('defaultVerifyEmailMailer', () => {
	it('is what the UserBase-bound guards mail through', () => {
		expect(defaultVerifyEmailMailer).to.equal(socketLabsVerifyEmailMailer)
	})
})
