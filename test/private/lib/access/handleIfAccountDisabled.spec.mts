/**
 * Tests for private/lib/access/handleIfAccountDisabled.mts
 *
 * Chain: handleIfAccountDisabled(email, disabled)
 *          → if disabled: new SocketLabsLib().accountDisabled(email) → throw Error(EMAIL_CHECK_LINK)
 *          → if not disabled (or omitted, default = false): resolves with no return value
 */
import { handleIfAccountDisabled } from '@private/lib/access/handleIfAccountDisabled.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { EMAIL_CHECK_LINK } from '@private/lib/access/Constants.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

// ---------------------------------------------------------------------------

describe('handleIfAccountDisabled', () => {
	let accountDisabledStub: sinon.SinonStub

	beforeEach(() => {
		accountDisabledStub = sinon.stub(SocketLabsLib.prototype, 'accountDisabled').resolves()
	})

	afterEach(() => {
		sinon.restore()
	})

	it('disabled = true → sends accountDisabled email and throws EMAIL_CHECK_LINK error', async () => {
		let caught: unknown

		try {
			await handleIfAccountDisabled('user@test.com', true)
		} catch (e) {
			caught = e
		}

		expect(caught).to.be.instanceOf(Error)
		expect((caught as Error).message).to.equal(EMAIL_CHECK_LINK)
		expect(accountDisabledStub.calledOnceWith('user@test.com')).to.equal(true)
	})

	it('disabled = false → resolves without calling accountDisabled', async () => {
		const result = await handleIfAccountDisabled('user@test.com', false)

		expect(result).to.equal(undefined)
		expect(accountDisabledStub.called).to.equal(false)
	})

	it('disabled omitted (default = false) → resolves without calling accountDisabled', async () => {
		const result = await handleIfAccountDisabled('user@test.com')

		expect(result).to.equal(undefined)
		expect(accountDisabledStub.called).to.equal(false)
	})
})
