/**
 * Tests for lib/access/resetPwdMailer.mts
 *
 * 2 things pinned:
 * - socketLabsResetPwdMailer forward 3 args, no more. A 4th arg here would pin a link base at
 * this seam instead of leaving `sendEmailReset`'s own default (`APP_DOMAIN`) to apply, silently
 * changing the host every pre-5.9.0 caller mail.
 * - createResetPwdMailer(base, path) forward both through as args 4 and 5, and forward
 * `undefined` for whichever was omitted — an unset `process.env.X` pass straight in, and
 * `undefined` is the only value that re-trigger the default param.
 */
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { createResetPwdMailer, IResetPwdMailer, socketLabsResetPwdMailer } from '@lib/access/resetPwdMailer.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

// ---------------------------------------------------------------------------

describe('socketLabsResetPwdMailer', () => {
	afterEach(() => sinon.restore())

	it('forwards email, hash and name to SocketLabs and nothing else', async () => {
		const stub = sinon.stub(SocketLabsLib.prototype, 'sendEmailReset').resolves()

		await socketLabsResetPwdMailer.sendEmailReset('a@test.com', 'hash1', 'Ada')

		expect(stub.calledOnceWithExactly('a@test.com', 'hash1', 'Ada')).to.equal(true)
	})

	it('returns what the SocketLabs client returns', async () => {
		sinon.stub(SocketLabsLib.prototype, 'sendEmailReset').resolves(true)

		expect(await socketLabsResetPwdMailer.sendEmailReset('a@test.com', 'hash1', '')).to.equal(true)
	})
})

describe('createResetPwdMailer', () => {
	afterEach(() => sinon.restore())

	it('forwards the configured link base and path as the 4th and 5th arguments', async () => {
		const stub = sinon.stub(SocketLabsLib.prototype, 'sendEmailReset').resolves()
		const mailer: IResetPwdMailer = createResetPwdMailer('https://customer.example.com', '/account/new-password')

		await mailer.sendEmailReset('a@test.com', 'hash1', 'Ada')

		expect(
			stub.calledOnceWithExactly('a@test.com', 'hash1', 'Ada', 'https://customer.example.com', '/account/new-password')
		).to.equal(true)
	})

	it('forwards undefined for both when called with no arguments', async () => {
		const stub = sinon.stub(SocketLabsLib.prototype, 'sendEmailReset').resolves()

		await createResetPwdMailer().sendEmailReset('a@test.com', 'hash1', '')

		// `undefined` reach the default params → `APP_DOMAIN` + `/x/reset`. Normalising to `''` at
		// this seam would instead build a link with no host at all.
		expect(stub.calledOnceWithExactly('a@test.com', 'hash1', '', undefined, undefined)).to.equal(true)
	})

	it('forwards the base alone when the path is omitted', async () => {
		const stub = sinon.stub(SocketLabsLib.prototype, 'sendEmailReset').resolves()

		await createResetPwdMailer('https://customer.example.com').sendEmailReset('a@test.com', 'hash1', '')

		expect(stub.calledOnceWithExactly('a@test.com', 'hash1', '', 'https://customer.example.com', undefined)).to.equal(true)
	})

	it('returns what the SocketLabs client returns', async () => {
		sinon.stub(SocketLabsLib.prototype, 'sendEmailReset').resolves(false)

		expect(await createResetPwdMailer('https://c.example.com').sendEmailReset('a@test.com', 'h', '')).to.equal(false)
	})
})
