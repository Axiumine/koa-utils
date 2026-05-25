import { expect } from 'chai'
import sinon from 'sinon'
import { UserBase } from '../../../dist/graphQL/models/MongoDB/UserBase.mjs'
import { registerNewUser } from '../../../dist/lib/db/registerNewUser.mjs'

describe('registerNewUser', () => {
	let sandbox: sinon.SinonSandbox
	let createStub: sinon.SinonStub

	before(function () {
		// bcrypt hash runs once in the suite — allow generous timeout
		this.timeout(30000)
	})

	beforeEach(() => {
		sandbox = sinon.createSandbox()
		createStub = sandbox.stub(UserBase, 'create').resolves([{ _id: 'fake-id' }] as never)
	})

	afterEach(() => {
		sandbox.restore()
	})

	it('returns a non-empty hash string', async function () {
		this.timeout(30000)
		const hash = await registerNewUser('user@test.com', 'pass123', {} as never)

		expect(hash).to.be.a('string')
		expect(hash.length).to.be.greaterThan(0)
	})

	it('calls UserBase.create with the session option', async function () {
		this.timeout(30000)
		const session = { id: 'sess-1' } as never
		await registerNewUser('user@test.com', 'pass123', session)

		expect(createStub.calledOnce).to.equal(true)
		const [, options] = createStub.firstCall.args
		expect(options).to.deep.equal({ session })
	})

	it('creates user with correct email, account.email.valid=false, requestTimes=1', async function () {
		this.timeout(30000)
		await registerNewUser('new@example.com', 'password', {} as never)

		const [docs] = createStub.firstCall.args
		const doc = docs[0]
		expect(doc.login.email).to.equal('new@example.com')
		expect(doc.account.email.valid).to.equal(false)
		expect(doc.account.email.requestTimes).to.equal(1)
		expect(doc.account.email.hash).to.be.a('string')
	})

	it('returns the same hash stored in account.email.hash', async function () {
		this.timeout(30000)
		const hash = await registerNewUser('x@y.com', 'pwd', {} as never)

		const [docs] = createStub.firstCall.args
		expect(hash).to.equal(docs[0].account.email.hash)
	})
})
