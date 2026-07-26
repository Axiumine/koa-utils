/**
 * Tests for private/lib/access/handleIfTooMuchRequestsTimes.mts
 *
 * Chain: createHandleIfTooMuchRequestsTimes(disposeFn, mailer)
 *          → mailer.tooMuchVerifyRequests → disposeFn(uEmail) → throw Error(EMAIL_CHECK_LINK)
 *
 * Branches:
 * - requestTimes < 5 → no-op, return undefined, no mail, no disposal
 * - requestTimes >= 5 → mail "too much requests" → dispose the user → throw EMAIL_CHECK_LINK
 * - requestTimes omitted → default 99 (>= 5) → same throw path
 */
import { createHandleIfTooMuchRequestsTimes, handleIfTooMuchRequestsTimes } from '@private/lib/access/handleIfTooMuchRequestsTimes.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { EMAIL_CHECK_LINK } from '@private/lib/access/Constants.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

import { fakeVerifyEmailMailer, IFakeVerifyEmailMailer } from '../../../helpers/fakeVerifyEmailMailer.mjs'

// ---------------------------------------------------------------------------

describe('handleIfTooMuchRequestsTimes', () => {
	let disposeFake: sinon.SinonStub
	let mailer: IFakeVerifyEmailMailer
	let guard: ReturnType<typeof createHandleIfTooMuchRequestsTimes>

	beforeEach(() => {
		disposeFake = sinon.stub().resolves()
		mailer = fakeVerifyEmailMailer()
		guard = createHandleIfTooMuchRequestsTimes(disposeFake as never, mailer)
	})

	afterEach(() => {
		sinon.restore()
	})

	it('requestTimes below 5 → does nothing (no email, no disposal, no throw)', async () => {
		const result = await guard('under@test.com', 4)

		expect(result).to.equal(undefined)
		expect(mailer.tooMuchVerifyRequests.called).to.equal(false)
		expect(disposeFake.called).to.equal(false)
	})

	it('requestTimes exactly 5 → sends email, disposes of the user, throws EMAIL_CHECK_LINK', async () => {
		let thrown: Error | undefined

		try {
			await guard('exact@test.com', 5)
		} catch (e) {
			thrown = e as Error
		}

		expect(thrown).to.be.instanceOf(Error)
		expect(thrown?.message).to.equal(EMAIL_CHECK_LINK)
		expect(mailer.tooMuchVerifyRequests.calledOnceWith('exact@test.com')).to.equal(true)
		expect(disposeFake.calledOnceWith('exact@test.com')).to.equal(true)
	})

	it('requestTimes above 5 → sends email, disposes of the user, throws EMAIL_CHECK_LINK', async () => {
		let thrown: Error | undefined

		try {
			await guard('above@test.com', 10)
		} catch (e) {
			thrown = e as Error
		}

		expect(thrown).to.be.instanceOf(Error)
		expect(thrown?.message).to.equal(EMAIL_CHECK_LINK)
		expect(mailer.tooMuchVerifyRequests.calledOnceWith('above@test.com')).to.equal(true)
		expect(disposeFake.calledOnceWith('above@test.com')).to.equal(true)
	})

	it('requestTimes omitted → defaults to 99 → throws EMAIL_CHECK_LINK', async () => {
		let thrown: Error | undefined

		try {
			await guard('default@test.com')
		} catch (e) {
			thrown = e as Error
		}

		expect(thrown).to.be.instanceOf(Error)
		expect(thrown?.message).to.equal(EMAIL_CHECK_LINK)
		expect(mailer.tooMuchVerifyRequests.calledOnceWith('default@test.com')).to.equal(true)
		expect(disposeFake.calledOnceWith('default@test.com')).to.equal(true)
	})

	it('a no-op disposal writer (onAbandon: keep) still rejects the link', async () => {
		const keep = sinon.stub().resolves()
		const keeping = createHandleIfTooMuchRequestsTimes(keep as never, mailer)

		let thrown: Error | undefined
		try {
			await keeping('kept@test.com', 7)
		} catch (e) {
			thrown = e as Error
		}

		expect(thrown?.message).to.equal(EMAIL_CHECK_LINK)
		expect(keep.calledOnce).to.equal(true)
	})

	it('the bound default deletes through UserBase and reaches SocketLabs tooMuchVerifyRequests', async () => {
		const deleteOneStub = sinon.stub(UserBase, 'deleteOne').resolves({ deletedCount: 1 } as never)
		const tooMuchStub = sinon.stub(SocketLabsLib.prototype, 'tooMuchVerifyRequests').resolves(null)
		// Address used by this test only — default binding debounce per address + template.
		const email = 'bound-too-much@test.com'

		let thrown: Error | undefined
		try {
			await handleIfTooMuchRequestsTimes(email, 5)
		} catch (e) {
			thrown = e as Error
		}

		expect(thrown?.message).to.equal(EMAIL_CHECK_LINK)
		expect(tooMuchStub.calledOnceWith(email)).to.equal(true)
		expect(deleteOneStub.calledOnceWith({ 'login.email': email })).to.equal(true)
	})
})
