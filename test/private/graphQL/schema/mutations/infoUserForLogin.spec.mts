/**
 * Tests for private/graphQL/schema/mutations/infoUserForLogin.mts
 *
 * Chain: infoUserForLogin → UserBase.findOne(...).select(...).session(...).exec() → throwUnauthorizedError on null
 */
import { infoUserForLogin } from '@private/graphQL/schema/mutations/infoUserForLogin.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { ClientSession, Types } from 'mongoose'
import { expect } from 'chai'
import sinon from 'sinon'

import { expectGraphQLErrorAsync } from '../../../../helpers/assertGraphQLError.mjs'

// ---------------------------------------------------------------------------

function makeQuery(value: unknown) {
	const q = {
		select: sinon.stub().returnsThis(),
		session: sinon.stub().returnsThis(),
		exec: () => Promise.resolve(value)
	}
	return q
}

describe('infoUserForLogin', () => {
	afterEach(() => {
		sinon.restore()
	})

	it('user found → resolves with the query result', async () => {
		const row = {
			_id: new Types.ObjectId(),
			login: { password: 'hashedpwd', lastLogin: new Date('2024-01-01') },
			account: { email: { valid: true }, deleted: false, disabled: false }
		}
		const query = makeQuery(row)
		const findOneStub = sinon.stub(UserBase, 'findOne').returns(query as never)
		const session = {} as ClientSession

		const result = await infoUserForLogin('user@test.com', session)

		expect(result).to.deep.equal(row)
		expect(findOneStub.calledOnceWith({ 'login.email': 'user@test.com' })).to.equal(true)
		expect(query.select.calledOnce).to.equal(true)
		expect(query.session.calledOnceWith(session)).to.equal(true)
	})

	it('user not found → throws 401 Unauthorized', async () => {
		sinon.stub(UserBase, 'findOne').returns(makeQuery(null) as never)
		const session = {} as ClientSession

		await expectGraphQLErrorAsync(() => infoUserForLogin('missing@test.com', session), 401, 'Unauthorized')
	})
})
