/**
 * Tests for private/lib/access/handleIfMoreThan3DaysPassed.mts
 *
 * Chain: handleIfMoreThan3DaysPassed(uEmail, dateLastReq)
 *          → StringLib.isoToTimestamp (compares dateLastReq vs "3 days ago")
 *          → if too old: SocketLabsLib.hashReqTooOld(uEmail) → deleteUserByEmail(uEmail) (UserBase.deleteOne)
 *                          → throw new Error(EMAIL_CHECK_LINK)
 *          → otherwise: resolves with no return value
 */
import { handleIfMoreThan3DaysPassed } from '@private/lib/access/handleIfMoreThan3DaysPassed.mjs'
import { EMAIL_CHECK_LINK } from '@private/lib/access/Constants.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

// ---------------------------------------------------------------------------

describe('handleIfMoreThan3DaysPassed', () => {
	let hashReqTooOldStub: sinon.SinonStub
	let deleteOneStub: sinon.SinonStub

	beforeEach(() => {
		hashReqTooOldStub = sinon.stub(SocketLabsLib.prototype, 'hashReqTooOld').resolves()
		deleteOneStub = sinon.stub(UserBase, 'deleteOne').resolves({ acknowledged: true, deletedCount: 1 } as never)
	})

	afterEach(() => {
		sinon.restore()
	})

	it('dateLastReq is fresh (now) → resolves without throwing, no email sent, no delete', async () => {
		const result = await handleIfMoreThan3DaysPassed('fresh@test.com', new Date())

		expect(result).to.equal(undefined)
		expect(hashReqTooOldStub.called).to.equal(false)
		expect(deleteOneStub.called).to.equal(false)
	})

	it('dateLastReq older than 3 days → sends hashReqTooOld, deletes the user and throws EMAIL_CHECK_LINK', async () => {
		const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)

		let thrown: Error | undefined
		try {
			await handleIfMoreThan3DaysPassed('stale@test.com', fourDaysAgo)
		} catch (e) {
			thrown = e as Error
		}

		expect(thrown).to.be.instanceOf(Error)
		expect(thrown?.message).to.equal(EMAIL_CHECK_LINK)
		expect(hashReqTooOldStub.calledOnce).to.equal(true)
		expect(hashReqTooOldStub.firstCall.args[0]).to.equal('stale@test.com')
		expect(deleteOneStub.calledOnce).to.equal(true)
		expect(deleteOneStub.firstCall.args[0]).to.deep.equal({ 'login.email': 'stale@test.com' })
	})

	it('dateLastReq omitted → defaults to "now" → resolves without throwing', async () => {
		const result = await handleIfMoreThan3DaysPassed('nodate@test.com')

		expect(result).to.equal(undefined)
		expect(hashReqTooOldStub.called).to.equal(false)
		expect(deleteOneStub.called).to.equal(false)
	})

	it('dateLastReq just under the 3-day threshold (2.5 days ago) → resolves without throwing', async () => {
		// Kept comfortably below the 3-day boundary (12h margin) so the comparison
		// is deterministic regardless of the few ms elapsed between building this
		// date and the function computing its own "now" internally.
		const twoAndHalfDaysAgo = new Date(Date.now() - 2.5 * 24 * 60 * 60 * 1000)

		const result = await handleIfMoreThan3DaysPassed('boundary@test.com', twoAndHalfDaysAgo)

		expect(result).to.equal(undefined)
		expect(hashReqTooOldStub.called).to.equal(false)
	})
})
