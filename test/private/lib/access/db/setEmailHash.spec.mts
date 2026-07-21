/**
 * Tests for private/lib/access/db/setEmailHash.mts
 *
 * Chain: setEmailHash(session, userId) → emailHash() (StringLib.randomString, sync, no I/O)
 *        → UserBase.updateOne({ _id: userId }, { $set: {...} }, { session, runValidators: true })
 *        returns the generated hash string
 */
import { setEmailHash } from '@private/lib/access/db/setEmailHash.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

// ---------------------------------------------------------------------------

describe('setEmailHash', () => {
	let updateOneStub: sinon.SinonStub

	beforeEach(() => {
		updateOneStub = sinon.stub(UserBase, 'updateOne').resolves({ acknowledged: true, modifiedCount: 1 } as never)
	})

	afterEach(() => {
		sinon.restore()
	})

	it('calls UserBase.updateOne with the _id filter and $set payload, using the given session', async () => {
		const userId = new Types.ObjectId()
		const fakeSession = { id: 'fake-session' } as never

		await setEmailHash(fakeSession, userId)

		expect(updateOneStub.calledOnce).to.equal(true)
		const [filter, update, options] = updateOneStub.firstCall.args

		expect(filter).to.deep.equal({ _id: userId })
		expect(update.$set).to.have.property('account.email.hash').that.is.a('string').and.not.equal('')
		expect(update.$set).to.have.property('account.email.requestTimes', 1)
		expect(update.$set['account.email.dateLastReq']).to.be.instanceOf(Date)
		expect(options).to.deep.equal({ session: fakeSession, runValidators: true })
	})

	it('returns the generated hash', async () => {
		const userId = new Types.ObjectId()

		const result = await setEmailHash({} as never, userId)

		expect(result).to.be.a('string').and.not.equal('')
		const [, update] = updateOneStub.firstCall.args
		expect(update.$set['account.email.hash']).to.equal(result)
	})
})
