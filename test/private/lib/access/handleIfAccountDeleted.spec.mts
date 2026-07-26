/**
 * Tests for private/lib/access/handleIfAccountDeleted.mts
 *
 * Chain: createHandleIfAccountDeleted(mailer) → (if deleted) mailer.accountDisabled(email) → throw Error(EMAIL_CHECK_LINK)
 *
 * Branches:
 * - deleted === true → mail accountDisabled → throw Error(EMAIL_CHECK_LINK)
 * - deleted === false → no mail, resolve
 * - deleted omitted (default false) → no mail, resolve
 *
 * Template really is accountDisabled: SocketLabsLib have none for a deleted account → this guard borrow
 * the disabled one. Asserted, not assumed — a future accountDeleted template must update both.
 */
import { createHandleIfAccountDeleted, handleIfAccountDeleted } from '@private/lib/access/handleIfAccountDeleted.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

import { fakeVerifyEmailMailer, IFakeVerifyEmailMailer } from '../../../helpers/fakeVerifyEmailMailer.mjs'

// ---------------------------------------------------------------------------

describe('handleIfAccountDeleted', () => {
	let mailer: IFakeVerifyEmailMailer
	let guard: ReturnType<typeof createHandleIfAccountDeleted>

	beforeEach(() => {
		mailer = fakeVerifyEmailMailer()
		guard = createHandleIfAccountDeleted(mailer)
	})

	afterEach(() => {
		sinon.restore()
	})

	it('deleted = true → sends accountDisabled email and throws EMAIL_CHECK_LINK error', async () => {
		let thrown: Error | undefined

		try {
			await guard('deleted@test.com', true)
		} catch (e) {
			thrown = e as Error
		}

		expect(thrown).to.be.instanceOf(Error)
		expect(thrown?.message).to.equal('/x/email-check')
		expect(mailer.accountDisabled.calledOnceWith('deleted@test.com')).to.equal(true)
	})

	it('deleted = false → does not send email and does not throw', async () => {
		const result = await guard('active@test.com', false)

		expect(result).to.equal(undefined)
		expect(mailer.accountDisabled.called).to.equal(false)
	})

	it('deleted omitted → defaults to false, does not send email and does not throw', async () => {
		const result = await guard('nodefault@test.com')

		expect(result).to.equal(undefined)
		expect(mailer.accountDisabled.called).to.equal(false)
	})

	it('the bound default reaches SocketLabs accountDisabled', async () => {
		const stub = sinon.stub(SocketLabsLib.prototype, 'accountDisabled').resolves()
		// Address used by this test only — default binding debounce per address + template.
		const email = 'bound-deleted@test.com'

		let thrown: Error | undefined
		try {
			await handleIfAccountDeleted(email, true)
		} catch (e) {
			thrown = e as Error
		}

		expect(thrown?.message).to.equal('/x/email-check')
		expect(stub.calledOnceWith(email)).to.equal(true)
	})
})
