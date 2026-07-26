/**
 * Tests for private/lib/access/handleIfAccountDisabled.mts
 *
 * Chain: createHandleIfAccountDisabled(mailer)
 * → disabled → mailer.accountDisabled(email) → throw Error(EMAIL_CHECK_LINK)
 * → not disabled (or omitted, default false) → resolve, no return value
 */
import { createHandleIfAccountDisabled, handleIfAccountDisabled } from '@private/lib/access/handleIfAccountDisabled.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { EMAIL_CHECK_LINK } from '@private/lib/access/Constants.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

import { fakeVerifyEmailMailer, IFakeVerifyEmailMailer } from '../../../helpers/fakeVerifyEmailMailer.mjs'

// ---------------------------------------------------------------------------

describe('handleIfAccountDisabled', () => {
	let mailer: IFakeVerifyEmailMailer
	let guard: ReturnType<typeof createHandleIfAccountDisabled>

	beforeEach(() => {
		mailer = fakeVerifyEmailMailer()
		guard = createHandleIfAccountDisabled(mailer)
	})

	afterEach(() => {
		sinon.restore()
	})

	it('disabled = true → sends accountDisabled email and throws EMAIL_CHECK_LINK error', async () => {
		let caught: unknown

		try {
			await guard('user@test.com', true)
		} catch (e) {
			caught = e
		}

		expect(caught).to.be.instanceOf(Error)
		expect((caught as Error).message).to.equal(EMAIL_CHECK_LINK)
		expect(mailer.accountDisabled.calledOnceWith('user@test.com')).to.equal(true)
	})

	it('disabled = false → resolves without calling accountDisabled', async () => {
		const result = await guard('user@test.com', false)

		expect(result).to.equal(undefined)
		expect(mailer.accountDisabled.called).to.equal(false)
	})

	it('disabled omitted (default = false) → resolves without calling accountDisabled', async () => {
		const result = await guard('user@test.com')

		expect(result).to.equal(undefined)
		expect(mailer.accountDisabled.called).to.equal(false)
	})

	it('the bound default reaches SocketLabs accountDisabled', async () => {
		const stub = sinon.stub(SocketLabsLib.prototype, 'accountDisabled').resolves()
		// Address used by this test only — default binding debounce per address + template.
		const email = 'bound-disabled@test.com'

		let caught: unknown
		try {
			await handleIfAccountDisabled(email, true)
		} catch (e) {
			caught = e
		}

		expect((caught as Error).message).to.equal(EMAIL_CHECK_LINK)
		expect(stub.calledOnceWith(email)).to.equal(true)
	})
})
