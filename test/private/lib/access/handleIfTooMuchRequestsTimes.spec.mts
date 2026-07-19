/**
 * Tests for private/lib/access/handleIfTooMuchRequestsTimes.mts
 *
 * Chain: handleIfTooMuchRequestsTimes
 *          → SocketLabsLib.tooMuchVerifyRequests (sendEmail)
 *          → deleteUserByEmail (UserBase.deleteOne)
 *
 * Branches:
 *   - requestTimes < 5 → no-op, returns undefined, no email sent, no delete
 *   - requestTimes >= 5 → sends "too much requests" email, deletes user, throws EMAIL_CHECK_LINK
 *   - requestTimes omitted → defaults to 99 (>= 5) → same throw path
 */
import { handleIfTooMuchRequestsTimes } from '@private/lib/access/handleIfTooMuchRequestsTimes.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { EMAIL_CHECK_LINK } from '@private/lib/access/Constants.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

// ---------------------------------------------------------------------------

describe('handleIfTooMuchRequestsTimes', () => {
	let tooMuchVerifyRequestsStub: sinon.SinonStub
	let deleteOneStub: sinon.SinonStub

	beforeEach(() => {
		tooMuchVerifyRequestsStub = sinon.stub(SocketLabsLib.prototype, 'tooMuchVerifyRequests').resolves(null)
		deleteOneStub = sinon.stub(UserBase, 'deleteOne').resolves({ deletedCount: 1 } as never)
	})

	afterEach(() => {
		sinon.restore()
	})

	it('requestTimes below 5 → does nothing (no email, no delete, no throw)', async () => {
		const result = await handleIfTooMuchRequestsTimes('under@test.com', 4)

		expect(result).to.equal(undefined)
		expect(tooMuchVerifyRequestsStub.called).to.equal(false)
		expect(deleteOneStub.called).to.equal(false)
	})

	it('requestTimes exactly 5 → sends email, deletes user, throws EMAIL_CHECK_LINK', async () => {
		let thrown: Error | undefined

		try {
			await handleIfTooMuchRequestsTimes('exact@test.com', 5)
		} catch (e) {
			thrown = e as Error
		}

		expect(thrown).to.be.instanceOf(Error)
		expect(thrown?.message).to.equal(EMAIL_CHECK_LINK)
		expect(tooMuchVerifyRequestsStub.calledOnceWith('exact@test.com')).to.equal(true)
		expect(deleteOneStub.calledOnceWith({ 'login.email': 'exact@test.com' })).to.equal(true)
	})

	it('requestTimes above 5 → sends email, deletes user, throws EMAIL_CHECK_LINK', async () => {
		let thrown: Error | undefined

		try {
			await handleIfTooMuchRequestsTimes('above@test.com', 10)
		} catch (e) {
			thrown = e as Error
		}

		expect(thrown).to.be.instanceOf(Error)
		expect(thrown?.message).to.equal(EMAIL_CHECK_LINK)
		expect(tooMuchVerifyRequestsStub.calledOnceWith('above@test.com')).to.equal(true)
		expect(deleteOneStub.calledOnceWith({ 'login.email': 'above@test.com' })).to.equal(true)
	})

	it('requestTimes omitted → defaults to 99 → throws EMAIL_CHECK_LINK', async () => {
		let thrown: Error | undefined

		try {
			await handleIfTooMuchRequestsTimes('default@test.com')
		} catch (e) {
			thrown = e as Error
		}

		expect(thrown).to.be.instanceOf(Error)
		expect(thrown?.message).to.equal(EMAIL_CHECK_LINK)
		expect(tooMuchVerifyRequestsStub.calledOnceWith('default@test.com')).to.equal(true)
		expect(deleteOneStub.calledOnceWith({ 'login.email': 'default@test.com' })).to.equal(true)
	})
})
