/**
 * Tests for private/graphQL/schema/mutations/updateLoginStatsRememberme.mts
 *
 * Chain: updateLoginStatsRememberme → _buildLoginStatsUpdate(lastLogin, rememberMe) → UserBase.updateOne
 *
 * _buildLoginStatsUpdate's own branches are covered in _buildLoginStatsUpdate.spec.mts; here we
 * only assert that this module wires its $set / $unset output, filter and options into updateOne.
 */
import { updateLoginStatsRememberme } from '@private/graphQL/schema/mutations/updateLoginStatsRememberme.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { ClientSession, Types } from 'mongoose'
import { expect } from 'chai'
import sinon from 'sinon'

describe('updateLoginStatsRememberme', () => {
	afterEach(() => {
		sinon.restore()
	})

	it('lastLogin === null → forwards firstLogin/lastLogin $set and no $unset to updateOne', async () => {
		const updateOneStub = sinon.stub(UserBase, 'updateOne').resolves({ modifiedCount: 1 } as never)
		const id = new Types.ObjectId()
		const session = {} as ClientSession

		await updateLoginStatsRememberme(id, null, true, session)

		expect(updateOneStub.calledOnce).to.equal(true)
		const [filter, update, options] = updateOneStub.firstCall.args as [object, { $set: object; $unset: object }, object]
		expect(filter).to.deep.equal({ _id: id })
		expect(update.$set).to.have.property('login.firstLogin')
		expect(update.$set).to.have.property('account.rememberMe', true)
		expect(update.$unset).to.deep.equal({})
		expect(options).to.deep.equal({ session, runValidators: true })
	})

	it('existing lastLogin + rememberMe=false → forwards $unset and no firstLogin to updateOne', async () => {
		const updateOneStub = sinon.stub(UserBase, 'updateOne').resolves({ modifiedCount: 1 } as never)
		const id = new Types.ObjectId()
		const session = {} as ClientSession
		const lastLogin = new Date('2024-01-01')

		await updateLoginStatsRememberme(id, lastLogin, false, session)

		const [, update] = updateOneStub.firstCall.args as [object, { $set: object; $unset: object }, object]
		expect(update.$set).to.not.have.property('login.firstLogin')
		expect(update.$unset).to.have.property('account.rememberMe', 1)
	})
})
