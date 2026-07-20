/**
 * Tests for private/graphQL/schema/mutations/updateLoginStats4ever.mts
 *
 * Chain: updateLoginStats4ever → UserBase.updateOne({$set: {login.lastLogin, [login.firstLogin]}})
 *
 * Unlike updateAdminLoginStats/updateLoginStatsRememberme, this module builds its own $set
 * inline (no _buildLoginStatsUpdate) and owns the `lastLogin === null` branch directly.
 */
import { updateLoginStats4ever } from '@private/graphQL/schema/mutations/updateLoginStats4ever.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { ClientSession, Types } from 'mongoose'
import { expect } from 'chai'
import sinon from 'sinon'

describe('updateLoginStats4ever', () => {
	afterEach(() => {
		sinon.restore()
	})

	it('lastLogin === null → sets both login.lastLogin and login.firstLogin', async () => {
		const updateOneStub = sinon.stub(UserBase, 'updateOne').resolves({ modifiedCount: 1 } as never)
		const id = new Types.ObjectId()
		const session = {} as ClientSession

		await updateLoginStats4ever(id, null, session)

		expect(updateOneStub.calledOnce).to.equal(true)
		const [filter, update, options] = updateOneStub.firstCall.args as [object, { $set: Record<string, unknown> }, object]
		expect(filter).to.deep.equal({ _id: id })
		expect(update.$set).to.have.property('login.lastLogin').that.is.instanceOf(Date)
		expect(update.$set).to.have.property('login.firstLogin').that.is.instanceOf(Date)
		expect(options).to.deep.equal({ session, runValidators: true })
	})

	it('lastLogin is an existing Date → sets login.lastLogin only, no firstLogin', async () => {
		const updateOneStub = sinon.stub(UserBase, 'updateOne').resolves({ modifiedCount: 1 } as never)
		const id = new Types.ObjectId()
		const session = {} as ClientSession
		const lastLogin = new Date('2024-01-01')

		await updateLoginStats4ever(id, lastLogin, session)

		const [, update] = updateOneStub.firstCall.args as [object, { $set: Record<string, unknown> }, object]
		expect(update.$set).to.have.property('login.lastLogin').that.is.instanceOf(Date)
		expect(update.$set).to.not.have.property('login.firstLogin')
	})
})
