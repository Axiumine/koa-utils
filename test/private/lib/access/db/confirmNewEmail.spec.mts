/**
 * Tests for private/lib/access/db/confirmNewEmail.mts
 *
 * Chain: confirmNewEmail(_id, email) → UserBase.updateOne({ _id }, { $set: ..., $unset: ... }).exec()
 *
 * No branches in this module — a single straight-line path. One test verifying
 * the collaborator call (filter + update shape) plus the resolved return value
 * is sufficient for 100% statements/branches/functions/lines.
 */
import confirmNewEmail from '@private/lib/access/db/confirmNewEmail.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

// ---------------------------------------------------------------------------

describe('confirmNewEmail', () => {
	let updateOneStub: sinon.SinonStub
	let execStub: sinon.SinonStub

	beforeEach(() => {
		execStub = sinon.stub().resolves({ acknowledged: true, modifiedCount: 1 })
		updateOneStub = sinon.stub(UserBase, 'updateOne').returns({ exec: execStub } as never)
	})

	afterEach(() => {
		sinon.restore()
	})

	it('updates login.email and unsets the email-change tracking fields for the given user', async () => {
		const _id = new Types.ObjectId()

		await confirmNewEmail(_id, 'new@test.com')

		expect(updateOneStub.calledOnce).to.equal(true)
		expect(updateOneStub.firstCall.args[0]).to.deep.equal({ _id })
		expect(updateOneStub.firstCall.args[1]).to.deep.equal({
			$set: { 'login.email': 'new@test.com' },
			$unset: {
				'account.email.hash': '',
				'account.email.dateLastReq': '',
				'account.email.requestTimes': '',
				'account.email.newEmailTmp': ''
			}
		})
		expect(execStub.calledOnce).to.equal(true)
	})

	it('resolves with the result of the exec() call', async () => {
		const _id = new Types.ObjectId()

		const result = await confirmNewEmail(_id, 'other@test.com')

		expect(result).to.deep.equal({ acknowledged: true, modifiedCount: 1 })
	})
})
