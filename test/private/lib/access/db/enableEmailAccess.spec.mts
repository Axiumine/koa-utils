/**
 * Tests for private/lib/access/db/enableEmailAccess.mts
 *
 * Chain: enableEmailAccess(_id, email)
 *   → UserBase.updateOne({ _id }, { $set: ..., $unset: ... }, { runValidators: true })
 *   → new SocketLabsLib().sendWelcome(email)
 *
 * 1 branch: welcome send reject/throw → Sentry once, swallow. updateOne already commit → account active,
 * link spent → reject must not reach routerVerifyEmail catch (/x/error). Happy path + both fail shapes
 * = 100% statements/branches/functions/lines.
 */
import { createEnableEmailAccess, enableEmailAccess } from '@private/lib/access/db/enableEmailAccess.mjs'
import { DEFAULT_VERIFY_EMAIL_PATHS } from '@lib/access/accessPaths.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import * as Sentry from '@sentry/node'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

import { fakeVerifyEmailMailer } from '../../../../helpers/fakeVerifyEmailMailer.mjs'

// ---------------------------------------------------------------------------

describe('enableEmailAccess', () => {
	let updateOneStub: sinon.SinonStub
	let sendWelcomeStub: sinon.SinonStub
	let captureStub: sinon.SinonStub

	beforeEach(() => {
		// Namespace sealed, scope object not → stub scope delegate (same trick as orFalse spec).
		captureStub = sinon.stub(Sentry.getCurrentScope(), 'captureException')
		updateOneStub = sinon.stub(UserBase, 'updateOne').resolves({ acknowledged: true, modifiedCount: 1 } as never)
		sendWelcomeStub = sinon.stub(SocketLabsLib.prototype, 'sendWelcome').resolves(true as never)
	})

	afterEach(() => {
		sinon.restore()
	})

	it('updates the user document to mark the email as valid and unset request tracking fields', async () => {
		const _id = new Types.ObjectId()

		await enableEmailAccess(_id, 'user@test.com')

		expect(updateOneStub.calledOnce).to.equal(true)
		expect(updateOneStub.firstCall.args[0]).to.deep.equal({ _id })
		expect(updateOneStub.firstCall.args[1]).to.deep.equal({
			$set: { 'account.email.valid': true },
			$unset: {
				'account.email.hash': '',
				'account.email.dateLastReq': '',
				'account.email.requestTimes': ''
			}
		})
		expect(updateOneStub.firstCall.args[2]).to.deep.equal({ runValidators: true })
	})

	it('sends the welcome email to the provided address after the update', async () => {
		const _id = new Types.ObjectId()

		await enableEmailAccess(_id, 'welcome@test.com')

		expect(sendWelcomeStub.calledOnce).to.equal(true)
		expect(sendWelcomeStub.firstCall.args[0]).to.equal('welcome@test.com')
		expect(updateOneStub.calledBefore(sendWelcomeStub)).to.equal(true)
	})

	it('resolves without returning a value', async () => {
		const _id = new Types.ObjectId()

		const result = await enableEmailAccess(_id, 'noreturn@test.com')

		expect(result).to.equal(undefined)
	})

	it('sends the welcome through an injected mailer, bypassing SocketLabs entirely', async () => {
		const mailer = fakeVerifyEmailMailer()
		const writer = createEnableEmailAccess(UserBase as never, DEFAULT_VERIFY_EMAIL_PATHS, mailer)
		const _id = new Types.ObjectId()

		await writer(_id, 'injected@test.com')

		expect(mailer.sendWelcome.calledOnceWithExactly('injected@test.com')).to.equal(true)
		expect(sendWelcomeStub.called).to.equal(false)
	})

	it('reports nothing to Sentry when the welcome send resolves', async () => {
		await enableEmailAccess(new Types.ObjectId(), 'ok@test.com')

		expect(captureStub.called).to.equal(false)
	})

	it('resolves and reports the error once when the welcome send rejects, after the update committed', async () => {
		const err = new Error('APP_DOMAIN not http(s)')
		const mailer = fakeVerifyEmailMailer()
		mailer.sendWelcome.rejects(err)
		const writer = createEnableEmailAccess(UserBase as never, DEFAULT_VERIFY_EMAIL_PATHS, mailer)

		const result = await writer(new Types.ObjectId(), 'reject@test.com')

		expect(result).to.equal(undefined)
		expect(updateOneStub.calledOnce).to.equal(true)
		expect(mailer.sendWelcome.calledOnce).to.equal(true)
		expect(captureStub.calledOnce).to.equal(true)
		expect(captureStub.firstCall.args[0]).to.equal(err)
	})

	it('resolves and reports the error once when the welcome send throws synchronously', async () => {
		const err = new Error('sync throw')
		const mailer = fakeVerifyEmailMailer()
		mailer.sendWelcome.throws(err)
		const writer = createEnableEmailAccess(UserBase as never, DEFAULT_VERIFY_EMAIL_PATHS, mailer)

		await writer(new Types.ObjectId(), 'throw@test.com')

		expect(captureStub.calledOnce).to.equal(true)
		expect(captureStub.firstCall.args[0]).to.equal(err)
	})

	it('still rejects when the update itself fails, and sends no welcome', async () => {
		const err = new Error('db down')
		updateOneStub.rejects(err)

		let caught: unknown
		try {
			await enableEmailAccess(new Types.ObjectId(), 'dbfail@test.com')
		} catch (e) {
			caught = e
		}

		expect(caught).to.equal(err)
		expect(sendWelcomeStub.called).to.equal(false)
		expect(captureStub.called).to.equal(false)
	})
})
