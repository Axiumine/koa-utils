/**
 * Tests for private/lib/access/db/getResetPwd.mts
 *
 * Chain: UserBase.findOne().select().session().lean()
 *
 * Branches:
 *   - queryRet === null (no reset request found) → returns null
 *   - queryRet !== null + resetDateReq !== undefined → resetHash = '' + hash (string)
 *   - queryRet !== null + resetDateReq === undefined → resetHash stays null
 *   - queryRet.personalData?.name defined (truthy) → name used as-is
 *   - queryRet.personalData is undefined → name falls back to ''
 */
import { getResetPwd } from '@private/lib/access/db/getResetPwd.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

// ---------------------------------------------------------------------------

/** Chain for UserBase.findOne(...).select(...).session(...).lean() */
function makeFindOneChain(value: unknown) {
	return {
		select: () => ({
			session: () => ({
				lean: () => Promise.resolve(value)
			})
		})
	}
}

// ---------------------------------------------------------------------------

describe('getResetPwd', () => {
	let findOneStub: sinon.SinonStub
	const fakeSession = {} as never

	beforeEach(() => {
		findOneStub = sinon.stub(UserBase, 'findOne')
	})

	afterEach(() => {
		sinon.restore()
	})

	it('no reset request found (queryRet === null) → returns null', async () => {
		findOneStub.returns(makeFindOneChain(null))

		const result = await getResetPwd(fakeSession, 'missing@test.com')

		expect(result).to.equal(null)
		expect(findOneStub.calledOnce).to.equal(true)
		expect(findOneStub.firstCall.args[0]).to.deep.equal({ 'login.email': 'missing@test.com' })
	})

	it('reset request found + resetDateReq defined + personalData.name defined → full object with string resetHash', async () => {
		const id = new Types.ObjectId()
		const resetDateReq = new Date()
		findOneStub.returns(
			makeFindOneChain({
				_id: id,
				personalData: { name: 'Alice' },
				account: { resetDateReq, email: { hash: 12345 } }
			})
		)

		const result = await getResetPwd(fakeSession, 'user@test.com')

		expect(result).to.deep.equal({
			_id: id,
			resetDateReq,
			resetHash: '12345',
			name: 'Alice'
		})
	})

	it('reset request found + resetDateReq undefined + personalData undefined → resetHash null, name defaults to empty string', async () => {
		const id = new Types.ObjectId()
		findOneStub.returns(
			makeFindOneChain({
				_id: id,
				account: { resetDateReq: undefined, email: { hash: 'unused' } }
			})
		)

		const result = await getResetPwd(fakeSession, 'user2@test.com')

		expect(result).to.deep.equal({
			_id: id,
			resetDateReq: undefined,
			resetHash: null,
			name: ''
		})
	})
})
