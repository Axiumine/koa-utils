/**
 * Tests for private/lib/access/db/incReqTimes.mts
 *
 * Chain: incReqTimes(_id) → UserBase.updateOne({ _id }, { $inc: ... }, { runValidators: true })
 *
 * No branches in this module — a single straight-line path. One test verifying
 * the collaborator call (filter + update + options) plus the returned value
 * is sufficient for 100% statements/branches/functions/lines.
 */
import { incReqTimes } from '@private/lib/access/db/incReqTimes.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

// ---------------------------------------------------------------------------

describe('incReqTimes', () => {
	let updateOneStub: sinon.SinonStub

	beforeEach(() => {
		updateOneStub = sinon.stub(UserBase, 'updateOne').resolves({ acknowledged: true, modifiedCount: 1 } as never)
	})

	afterEach(() => {
		sinon.restore()
	})

	it('increments account.email.requestTimes for the given user with validators enabled', async () => {
		const _id = new Types.ObjectId()

		await incReqTimes(_id)

		expect(updateOneStub.calledOnce).to.equal(true)
		expect(updateOneStub.firstCall.args[0]).to.deep.equal({ _id })
		expect(updateOneStub.firstCall.args[1]).to.deep.equal({ $inc: { 'account.email.requestTimes': 1 } })
		expect(updateOneStub.firstCall.args[2]).to.deep.equal({ runValidators: true })
	})

	it('returns whatever UserBase.updateOne resolves to (not awaited internally, propagated as a promise)', async () => {
		const _id = new Types.ObjectId()

		const result = await incReqTimes(_id)

		expect(result).to.deep.equal({ acknowledged: true, modifiedCount: 1 })
	})
})
