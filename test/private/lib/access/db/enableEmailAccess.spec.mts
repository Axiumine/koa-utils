/**
 * Tests for private/lib/access/db/enableEmailAccess.mts
 *
 * Chain: enableEmailAccess(_id, email)
 *   → UserBase.updateOne({ _id }, { $set: ..., $unset: ... }, { runValidators: true })
 *   → new SocketLabsLib().sendWelcome(email)
 *
 * No branches in this module — a single straight-line path. One test verifying
 * both collaborator calls (with argument shapes) plus the resolved return value
 * is sufficient for 100% statements/branches/functions/lines.
 */
import { enableEmailAccess } from '@private/lib/access/db/enableEmailAccess.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

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
})
