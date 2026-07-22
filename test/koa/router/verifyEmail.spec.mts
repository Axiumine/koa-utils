/**
 * Tests for koa/router/verifyEmail.mts
 *
 * The handler used to be untestable: its first statement was an ESM live binding sinon cannot stub,
 * so every call rejected on the DB read and only the catch branch was ever reached — the try-body sat
 * under a `c8 ignore`. Now the reader, the guard chain and the writer are injected, so the happy path
 * and both catch branches are exercised for real, and the ignore block is gone.
 */
import { createVerifyEmailRouter, routerVerifyEmail } from '../../../dist/koa/router/verifyEmail.mjs'
import { expect } from 'chai'
import { Types } from 'mongoose'
import sinon from 'sinon'

const EMAIL = 'User@Example.com'
const HASH = 'abc'

function makeCtx(email = EMAIL, hash = HASH) {
	const redirects: string[] = []
	return {
		ctx: { params: { email, hash }, redirect: (url: string) => redirects.push(url) } as never,
		redirects
	}
}

describe('createVerifyEmailRouter', () => {
	afterEach(() => sinon.restore())

	it('happy path: reads the user lowercased, runs the guards, enables access and redirects to registration-done', async () => {
		const uId = new Types.ObjectId()
		const user = { _id: uId }
		const userData4VerifyEmail = sinon.stub().resolves(user)
		const assertVerifyEmailAllowed = sinon.stub().resolves(uId)
		const enableEmailAccess = sinon.stub().resolves()

		const mw = createVerifyEmailRouter({ userData4VerifyEmail, assertVerifyEmailAllowed, enableEmailAccess } as never)()
		const { ctx, redirects } = makeCtx()
		await mw(ctx)

		// the lookup is lowercased, the guards get the raw url values, the enable gets the returned id
		expect(userData4VerifyEmail.calledOnceWithExactly('user@example.com')).to.equal(true)
		expect(assertVerifyEmailAllowed.calledOnceWithExactly(user, EMAIL, HASH)).to.equal(true)
		expect(enableEmailAccess.calledOnceWithExactly(uId, EMAIL)).to.equal(true)
		expect(redirects).to.deep.equal(['/x/registration-done'])
	})

	it('enables access only after the guards pass — a rejecting guard leaves the account untouched', async () => {
		const enableEmailAccess = sinon.stub().resolves()
		const mw = createVerifyEmailRouter({
			userData4VerifyEmail: sinon.stub().resolves({ _id: new Types.ObjectId() }),
			assertVerifyEmailAllowed: sinon.stub().rejects(new Error('/x/email-already-valid')),
			enableEmailAccess
		} as never)()
		const { ctx, redirects } = makeCtx()
		await mw(ctx)

		expect(enableEmailAccess.called).to.equal(false)
		expect(redirects).to.deep.equal(['/x/email-already-valid'])
	})

	it('redirects to /x/error when the thrown message is not a safe redirect target', async () => {
		const mw = createVerifyEmailRouter({
			userData4VerifyEmail: sinon.stub().rejects(new Error('connection refused')),
			assertVerifyEmailAllowed: sinon.stub().resolves(),
			enableEmailAccess: sinon.stub().resolves()
		} as never)()
		const { ctx, redirects } = makeCtx()
		await mw(ctx)

		expect(redirects).to.deep.equal(['/x/error'])
	})

	it('a failing enableEmailAccess still lands in the catch branch', async () => {
		const mw = createVerifyEmailRouter({
			userData4VerifyEmail: sinon.stub().resolves({ _id: new Types.ObjectId() }),
			assertVerifyEmailAllowed: sinon.stub().resolves(new Types.ObjectId()),
			enableEmailAccess: sinon.stub().rejects(new Error('write failed'))
		} as never)()
		const { ctx, redirects } = makeCtx()
		await mw(ctx)

		expect(redirects).to.deep.equal(['/x/error'])
	})
})

describe('routerVerifyEmail (UserBase-bound default)', () => {
	it('returns a middleware function', () => {
		expect(routerVerifyEmail()).to.be.a('function')
	})

	it('redirects to /x/error when the DB is unavailable', async () => {
		const mw = routerVerifyEmail()
		const { ctx, redirects } = makeCtx()
		// No DB connection — userData4VerifyEmail rejects; catch block redirects to /x/error
		await mw(ctx)
		expect(redirects).to.deep.equal(['/x/error'])
	})
})
