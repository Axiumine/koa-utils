/**
 * Tests for koa/router/verifyEmail.mts
 *
 * Handler was untestable: first statement an ESM live binding sinon cannot stub → every
 * call rejected on the DB read → only the catch branch reached, try-body under `c8 ignore`.
 * Now reader, guard chain, writer injected → happy path + both catch branches exercised
 * for real, ignore block gone.
 */
import { DEFAULT_VERIFY_EMAIL_PATHS } from '../../../dist/lib/access/accessPaths.mjs'
import { createVerifyEmailRouter, routerVerifyEmail } from '../../../dist/koa/router/verifyEmail.mjs'
import { createEnableEmailAccess } from '../../../dist/private/lib/access/db/enableEmailAccess.mjs'
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

		// lookup lowercased, guards get raw url values, enable get the returned id
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

	it('a rejecting welcome mail after the commit does not undo the activation: still redirects to registration-done', async () => {
		// Real writer, fake model + mailer. updateOne commit first → account active, hash gone.
		// Welcome reject (APP_DOMAIN not http(s) → 500) must not reach catch → /x/error, no link left to retry.
		const uId = new Types.ObjectId()
		const updateOne = sinon.stub().resolves()
		const sendWelcome = sinon.stub().rejects(new Error('Internal Server Error'))
		const enableEmailAccess = createEnableEmailAccess({ updateOne } as never, DEFAULT_VERIFY_EMAIL_PATHS, {
			sendWelcome
		} as never)

		const mw = createVerifyEmailRouter({
			userData4VerifyEmail: sinon.stub().resolves({ _id: uId }),
			assertVerifyEmailAllowed: sinon.stub().resolves(uId),
			enableEmailAccess
		} as never)()
		const { ctx, redirects } = makeCtx()
		await mw(ctx)

		expect(updateOne.calledOnce).to.equal(true)
		expect(sendWelcome.calledOnce).to.equal(true)
		expect(redirects).to.deep.equal(['/x/registration-done'])
	})
})

describe('routerVerifyEmail (UserBase-bound default)', () => {
	it('returns a middleware function', () => {
		expect(routerVerifyEmail()).to.be.a('function')
	})

	it('redirects to /x/error when the DB is unavailable', async () => {
		const mw = routerVerifyEmail()
		const { ctx, redirects } = makeCtx()
		// No DB conn → userData4VerifyEmail reject → catch redirect to /x/error
		await mw(ctx)
		expect(redirects).to.deep.equal(['/x/error'])
	})
})
