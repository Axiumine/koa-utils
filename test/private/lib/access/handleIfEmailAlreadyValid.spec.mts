/**
 * Tests for private/lib/access/handleIfEmailAlreadyValid.mts
 *
 * Chain: handleIfEmailAlreadyValid → (if valid) SocketLabsLib.emailAlreadyValid → throws Error(EMAIL_CHECK_LINK)
 *
 * Branches:
 *   - valid === false → no-op, resolves undefined, email not sent
 *   - valid === true  → sends "already valid" email then throws Error(EMAIL_CHECK_LINK)
 */
import { handleIfEmailAlreadyValid } from '@private/lib/access/handleIfEmailAlreadyValid.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

// ---------------------------------------------------------------------------

describe('handleIfEmailAlreadyValid', () => {
	let emailAlreadyValidStub: sinon.SinonStub

	beforeEach(() => {
		emailAlreadyValidStub = sinon.stub(SocketLabsLib.prototype, 'emailAlreadyValid').resolves()
	})

	afterEach(() => {
		sinon.restore()
	})

	it('valid === false → does nothing, resolves undefined, no email sent', async () => {
		const result = await handleIfEmailAlreadyValid('user@test.com', false)

		expect(result).to.equal(undefined)
		expect(emailAlreadyValidStub.called).to.equal(false)
	})

	it('valid === true → sends already-valid email then throws EMAIL_CHECK_LINK error', async () => {
		let thrown: Error | undefined

		try {
			await handleIfEmailAlreadyValid('user@test.com', true)
		} catch (e) {
			thrown = e as Error
		}

		expect(thrown).to.be.instanceOf(Error)
		expect(thrown?.message).to.equal('/x/email-check')
		expect(emailAlreadyValidStub.calledOnceWith('user@test.com')).to.equal(true)
	})
})
