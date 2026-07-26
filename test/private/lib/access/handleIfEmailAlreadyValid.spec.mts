/**
 * Tests for private/lib/access/handleIfEmailAlreadyValid.mts
 *
 * Chain: createHandleIfEmailAlreadyValid(mailer) → (valid) mailer.emailAlreadyValid → throw Error(EMAIL_CHECK_LINK)
 *
 * Branches:
 * - valid === false → no-op, resolve undefined, no mail
 * - valid === true → mail "already valid" → throw Error(EMAIL_CHECK_LINK)
 *
 * Mailer injected, not stubbed on SocketLabsLib.prototype: the bound default is debounced per address
 * + template → a prototype stub only see the send if no other spec mailed the same address first.
 * Last test use an address nothing else touch → pin the template the default binding reach.
 */
import { createHandleIfEmailAlreadyValid, handleIfEmailAlreadyValid } from '@private/lib/access/handleIfEmailAlreadyValid.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

import { fakeVerifyEmailMailer, IFakeVerifyEmailMailer } from '../../../helpers/fakeVerifyEmailMailer.mjs'

// ---------------------------------------------------------------------------

describe('handleIfEmailAlreadyValid', () => {
	let mailer: IFakeVerifyEmailMailer
	let guard: ReturnType<typeof createHandleIfEmailAlreadyValid>

	beforeEach(() => {
		mailer = fakeVerifyEmailMailer()
		guard = createHandleIfEmailAlreadyValid(mailer)
	})

	afterEach(() => {
		sinon.restore()
	})

	it('valid === false → does nothing, resolves undefined, no email sent', async () => {
		const result = await guard('user@test.com', false)

		expect(result).to.equal(undefined)
		expect(mailer.emailAlreadyValid.called).to.equal(false)
	})

	it('valid === true → sends already-valid email then throws EMAIL_CHECK_LINK error', async () => {
		let thrown: Error | undefined

		try {
			await guard('user@test.com', true)
		} catch (e) {
			thrown = e as Error
		}

		expect(thrown).to.be.instanceOf(Error)
		expect(thrown?.message).to.equal('/x/email-check')
		expect(mailer.emailAlreadyValid.calledOnceWith('user@test.com')).to.equal(true)
	})

	it('still throws when the mail is suppressed by the debounce', async () => {
		mailer.emailAlreadyValid.resolves(undefined)
		let thrown: Error | undefined

		try {
			await guard('throttled@test.com', true)
		} catch (e) {
			thrown = e as Error
		}

		// Dropped notification must not become a granted link: the redirect is unconditional.
		expect(thrown?.message).to.equal('/x/email-check')
	})

	it('the bound default reaches SocketLabs emailAlreadyValid', async () => {
		const stub = sinon.stub(SocketLabsLib.prototype, 'emailAlreadyValid').resolves()
		// Address used by this test only — default binding debounce per address + template.
		const email = 'bound-already-valid@test.com'

		let thrown: Error | undefined
		try {
			await handleIfEmailAlreadyValid(email, true)
		} catch (e) {
			thrown = e as Error
		}

		expect(thrown?.message).to.equal('/x/email-check')
		expect(stub.calledOnceWith(email)).to.equal(true)
	})
})
