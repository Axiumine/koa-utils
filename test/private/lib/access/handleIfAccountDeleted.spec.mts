/**
 * Tests for private/lib/access/handleIfAccountDeleted.mts
 *
 * Chain: handleIfAccountDeleted(email, deleted) → SocketLabsLib.accountDisabled(email) → throw Error(EMAIL_CHECK_LINK)
 *
 * Branches:
 *   - deleted === true  → sends accountDisabled email, then throws Error(EMAIL_CHECK_LINK)
 *   - deleted === false → no email sent, resolves without throwing
 *   - deleted omitted (default parameter = false) → no email sent, resolves without throwing
 */
import { handleIfAccountDeleted } from '@private/lib/access/handleIfAccountDeleted.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

// ---------------------------------------------------------------------------

describe('handleIfAccountDeleted', () => {
	let accountDisabledStub: sinon.SinonStub

	beforeEach(() => {
		accountDisabledStub = sinon.stub(SocketLabsLib.prototype, 'accountDisabled').resolves()
	})

	afterEach(() => {
		sinon.restore()
	})

	it('deleted = true → sends accountDisabled email and throws EMAIL_CHECK_LINK error', async () => {
		let thrown: Error | undefined

		try {
			await handleIfAccountDeleted('deleted@test.com', true)
		} catch (e) {
			thrown = e as Error
		}

		expect(thrown).to.be.instanceOf(Error)
		expect(thrown?.message).to.equal('/x/email-check')
		expect(accountDisabledStub.calledOnceWith('deleted@test.com')).to.equal(true)
	})

	it('deleted = false → does not send email and does not throw', async () => {
		const result = await handleIfAccountDeleted('active@test.com', false)

		expect(result).to.equal(undefined)
		expect(accountDisabledStub.called).to.equal(false)
	})

	it('deleted omitted → defaults to false, does not send email and does not throw', async () => {
		const result = await handleIfAccountDeleted('nodefault@test.com')

		expect(result).to.equal(undefined)
		expect(accountDisabledStub.called).to.equal(false)
	})
})
