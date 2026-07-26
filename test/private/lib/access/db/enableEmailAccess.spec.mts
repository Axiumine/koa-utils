/**
 * Tests for private/lib/access/db/enableEmailAccess.mts
 *
 * Chain: enableEmailAccess(_id, email)
 *   → UserBase.updateOne({ _id }, { $set: ..., $unset: ... }, { runValidators: true })
 *   → new SocketLabsLib().sendWelcome(email)
 *
 * No branches — 1 straight-line path. 1 test on both collaborator calls (arg shapes) + the resolved
 * return value = 100% statements/branches/functions/lines.
 */
import { createEnableEmailAccess, enableEmailAccess } from '@private/lib/access/db/enableEmailAccess.mjs'
import { DEFAULT_VERIFY_EMAIL_PATHS } from '@lib/access/accessPaths.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

import { fakeVerifyEmailMailer } from '../../../../helpers/fakeVerifyEmailMailer.mjs'

// ---------------------------------------------------------------------------

describe('enableEmailAccess', () => {
	let updateOneStub: sinon.SinonStub
	let sendWelcomeStub: sinon.SinonStub

	beforeEach(() => {
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
})
