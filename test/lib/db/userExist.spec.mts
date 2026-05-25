import { expect } from 'chai'
import sinon from 'sinon'
import { UserBase } from '../../../dist/graphQL/models/MongoDB/UserBase.mjs'
import { userExist } from '../../../dist/lib/db/userExist.mjs'

describe('userExist', () => {
	let sandbox: sinon.SinonSandbox
	let findOneStub: sinon.SinonStub
	let leanStub: sinon.SinonStub
	let sessionStub: sinon.SinonStub

	beforeEach(() => {
		sandbox = sinon.createSandbox()
		leanStub = sinon.stub()
		sessionStub = sinon.stub().returns({ lean: leanStub })
		findOneStub = sandbox.stub(UserBase, 'findOne').returns({ session: sessionStub } as never)
	})

	afterEach(() => {
		sandbox.restore()
	})

	it('returns true when user is found', async () => {
		leanStub.resolves({ _id: 'some-id' })

		const result = await userExist('test@example.com', {} as never)

		expect(result).to.equal(true)
	})

	it('returns false when user is not found', async () => {
		leanStub.resolves(null)

		const result = await userExist('noone@example.com', {} as never)

		expect(result).to.equal(false)
	})

	it('queries by login.email field', async () => {
		leanStub.resolves(null)

		await userExist('query@example.com', {} as never)

		expect(findOneStub.calledWith({ 'login.email': 'query@example.com' }, '_id')).to.equal(true)
	})
})
