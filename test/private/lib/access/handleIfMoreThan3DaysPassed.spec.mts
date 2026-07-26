/**
 * Tests for private/lib/access/handleIfMoreThan3DaysPassed.mts
 *
 * Chain: createHandleIfMoreThan3DaysPassed(disposeFn, mailer)(uEmail, dateLastReq)
 *          → StringLib.isoToTimestamp (compares dateLastReq vs "3 days ago")
 *          → if too old: mailer.hashReqTooOld(uEmail) → disposeFn(uEmail) → throw new Error(EMAIL_CHECK_LINK)
 *          → otherwise: resolves with no return value
 *
 * The disposal writer is injected, so what it does is the caller's policy (delete, tombstone, nothing).
 * The guard must throw either way — that is asserted here, not left to the flow factory.
 */
import { createHandleIfMoreThan3DaysPassed, handleIfMoreThan3DaysPassed } from '@private/lib/access/handleIfMoreThan3DaysPassed.mjs'
import { EMAIL_CHECK_LINK } from '@private/lib/access/Constants.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

import { fakeVerifyEmailMailer, IFakeVerifyEmailMailer } from '../../../helpers/fakeVerifyEmailMailer.mjs'

// ---------------------------------------------------------------------------

describe('handleIfMoreThan3DaysPassed', () => {
	let disposeFake: sinon.SinonStub
	let mailer: IFakeVerifyEmailMailer
	let guard: ReturnType<typeof createHandleIfMoreThan3DaysPassed>

	beforeEach(() => {
		disposeFake = sinon.stub().resolves()
		mailer = fakeVerifyEmailMailer()
		guard = createHandleIfMoreThan3DaysPassed(disposeFake as never, mailer)
	})

	afterEach(() => {
		sinon.restore()
	})

	it('dateLastReq is fresh (now) → resolves without throwing, no email sent, no disposal', async () => {
		const result = await guard('fresh@test.com', new Date())

		expect(result).to.equal(undefined)
		expect(mailer.hashReqTooOld.called).to.equal(false)
		expect(disposeFake.called).to.equal(false)
	})

	it('dateLastReq older than 3 days → sends hashReqTooOld, disposes of the user and throws EMAIL_CHECK_LINK', async () => {
		const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)

		let thrown: Error | undefined
		try {
			await guard('stale@test.com', fourDaysAgo)
		} catch (e) {
			thrown = e as Error
		}

		expect(thrown).to.be.instanceOf(Error)
		expect(thrown?.message).to.equal(EMAIL_CHECK_LINK)
		expect(mailer.hashReqTooOld.calledOnce).to.equal(true)
		expect(mailer.hashReqTooOld.firstCall.args[0]).to.equal('stale@test.com')
		expect(disposeFake.calledOnceWith('stale@test.com')).to.equal(true)
	})

	it('a no-op disposal writer (onAbandon: keep) still rejects the link', async () => {
		const keep = sinon.stub().resolves()
		const keeping = createHandleIfMoreThan3DaysPassed(keep as never, mailer)
		const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)

		let thrown: Error | undefined
		try {
			await keeping('kept@test.com', fourDaysAgo)
		} catch (e) {
			thrown = e as Error
		}

		expect(thrown?.message).to.equal(EMAIL_CHECK_LINK)
		expect(keep.calledOnce).to.equal(true)
	})

	it('dateLastReq omitted → defaults to "now" → resolves without throwing', async () => {
		const result = await guard('nodate@test.com')

		expect(result).to.equal(undefined)
		expect(mailer.hashReqTooOld.called).to.equal(false)
		expect(disposeFake.called).to.equal(false)
	})

	it('dateLastReq just under the 3-day threshold (2.5 days ago) → resolves without throwing', async () => {
		// Kept comfortably below the 3-day boundary (12h margin) so the comparison
		// is deterministic regardless of the few ms elapsed between building this
		// date and the function computing its own "now" internally.
		const twoAndHalfDaysAgo = new Date(Date.now() - 2.5 * 24 * 60 * 60 * 1000)

		const result = await guard('boundary@test.com', twoAndHalfDaysAgo)

		expect(result).to.equal(undefined)
		expect(mailer.hashReqTooOld.called).to.equal(false)
	})

	it('the bound default deletes through UserBase and reaches SocketLabs hashReqTooOld', async () => {
		const deleteOneStub = sinon.stub(UserBase, 'deleteOne').resolves({ acknowledged: true, deletedCount: 1 } as never)
		const hashReqTooOldStub = sinon.stub(SocketLabsLib.prototype, 'hashReqTooOld').resolves()
		const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
		// Address used by this test only — the default binding debounces per address + template.
		const email = 'bound-too-old@test.com'

		let thrown: Error | undefined
		try {
			await handleIfMoreThan3DaysPassed(email, fourDaysAgo)
		} catch (e) {
			thrown = e as Error
		}

		expect(thrown?.message).to.equal(EMAIL_CHECK_LINK)
		expect(hashReqTooOldStub.calledOnceWith(email)).to.equal(true)
		expect(deleteOneStub.calledOnceWith({ 'login.email': email })).to.equal(true)
	})
})
