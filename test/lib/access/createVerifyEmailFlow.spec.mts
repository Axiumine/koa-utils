/**
 * Tests for lib/access/createVerifyEmailFlow.mts
 *
 * Same contract as createResetPwdFlow: the whole chain is driven against a model whose layout shares
 * no field path with UserBase, and every read, projection and write is asserted against the map.
 *
 * The guards are wired to the same model too — a five-strike delete must hit the caller's collection,
 * not `user`.
 */
import { createVerifyEmailFlow } from '../../../dist/lib/access/createVerifyEmailFlow.mjs'
import { ALWAYS_MAIL } from '@lib/access/createMailThrottle.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { expect } from 'chai'
import { Types } from 'mongoose'
import sinon from 'sinon'

import { fakeVerifyEmailMailer } from '../../helpers/fakeVerifyEmailMailer.mjs'

const EMAIL = 'user@example.com'
const HASH = 'the-stored-verify-hash'

/** A layout with no field in common with UserBase, and one container path to clear. */
const PATHS = {
	email: 'mail',
	valid: 'verified',
	hash: 'verification.hash',
	dateLastReq: 'verification.dateLastReq',
	requestTimes: 'verification.requestTimes',
	newEmailTmp: 'verification.pending',
	deleted: 'flags.deleted',
	disabled: 'flags.disabled',
	verifyClear: ['verification'],
	emailChangeClear: ['verification']
}

function makeModel(doc: unknown, qty = 0) {
	const query = {
		selected: '',
		select(fields: string) {
			query.selected = fields
			return query
		},
		session: () => query,
		lean: () => Promise.resolve(doc),
		exec: () => Promise.resolve(doc)
	}
	const updateQuery = {
		session: () => updateQuery,
		exec: () => Promise.resolve({ modifiedCount: 1 })
	}
	return {
		query,
		findOne: sinon.stub().returns(query),
		updateOne: sinon.stub().returns(updateQuery),
		countDocuments: sinon.stub().resolves(qty),
		deleteOne: sinon.stub().resolves({ deletedCount: 1 })
	} as never
}

/** The stored document, in the custom layout. */
function makeDoc(overrides: Record<string, unknown> = {}) {
	return {
		_id: new Types.ObjectId(),
		verified: false,
		verification: { hash: HASH, dateLastReq: new Date(), requestTimes: 1, pending: EMAIL },
		flags: { deleted: false, disabled: false },
		...overrides
	}
}

function makeCtx(email = EMAIL, hash = HASH) {
	const redirects: string[] = []
	return {
		ctx: { params: { email, hash }, redirect: (url: string) => redirects.push(url) } as never,
		redirects
	}
}

describe('createVerifyEmailFlow', () => {
	let sendWelcome: sinon.SinonStub
	let wrongHash: sinon.SinonStub
	let tooMuchVerifyRequests: sinon.SinonStub
	let hashReqTooOld: sinon.SinonStub
	let alreadyValid: sinon.SinonStub

	beforeEach(() => {
		sendWelcome = sinon.stub(SocketLabsLib.prototype, 'sendWelcome').resolves()
		wrongHash = sinon.stub(SocketLabsLib.prototype, 'wrongHash').resolves()
		tooMuchVerifyRequests = sinon.stub(SocketLabsLib.prototype, 'tooMuchVerifyRequests').resolves()
		hashReqTooOld = sinon.stub(SocketLabsLib.prototype, 'hashReqTooOld').resolves()
		alreadyValid = sinon.stub(SocketLabsLib.prototype, 'emailAlreadyValid').resolves()
	})

	afterEach(() => sinon.restore())

	it('exposes the whole chain', () => {
		const flow = createVerifyEmailFlow({ model: makeModel(null), paths: PATHS })

		for (const key of [
			'userData4VerifyEmail',
			'setEmailHash',
			'enableEmailAccess',
			'confirmNewEmail',
			'deleteUserByEmail',
			'incReqTimes',
			'assertVerifyEmailAllowed',
			'routerVerifyEmail'
		]) {
			expect(flow[key as keyof typeof flow]).to.be.a('function')
		}
		expect(flow.emailChangeHashVerify.resolve).to.be.a('function')
	})

	it('with no paths at all falls back to the UserBase layout', async () => {
		const model = makeModel(makeDoc())
		const flow = createVerifyEmailFlow({ model })

		await flow.userData4VerifyEmail(EMAIL)

		expect(model.findOne.calledOnceWithExactly({ 'login.email': EMAIL })).to.equal(true)
		expect(model.query.selected).to.equal(
			'_id account.email.hash account.email.valid account.email.dateLastReq account.email.requestTimes account.deleted account.disabled'
		)
	})

	describe('routerVerifyEmail', () => {
		it('happy path: reads and enables through the supplied paths', async () => {
			const model = makeModel(makeDoc())
			const flow = createVerifyEmailFlow({ model, paths: PATHS })
			const { ctx, redirects } = makeCtx()

			await flow.routerVerifyEmail()(ctx)

			expect(model.findOne.calledOnceWithExactly({ mail: EMAIL })).to.equal(true)
			expect(model.query.selected).to.equal(
				'_id verification.hash verified verification.dateLastReq verification.requestTimes flags.deleted flags.disabled'
			)

			const [, update] = model.updateOne.firstCall.args
			// the container is unset, not its members
			expect(update).to.deep.equal({ $set: { verified: true }, $unset: { verification: '' } })
			expect(sendWelcome.calledOnceWithExactly(EMAIL)).to.equal(true)
			expect(redirects).to.deep.equal(['/x/registration-done'])
		})

		it('a wrong hash bumps the strike counter on the custom path and never enables the account', async () => {
			const model = makeModel(makeDoc())
			const flow = createVerifyEmailFlow({ model, paths: PATHS })
			const { ctx, redirects } = makeCtx(EMAIL, 'wrong')

			await flow.routerVerifyEmail()(ctx)

			const [, update] = model.updateOne.firstCall.args
			expect(update).to.deep.equal({ $inc: { 'verification.requestTimes': 1 } })
			expect(wrongHash.calledOnceWithExactly(EMAIL, 2)).to.equal(true)
			expect(sendWelcome.called).to.equal(false)
			expect(redirects).to.deep.equal(['/x/email-check'])
		})

		it('the fifth strike deletes from the caller collection, keyed by the custom email path', async () => {
			const model = makeModel(makeDoc({ verification: { hash: HASH, dateLastReq: new Date(), requestTimes: 5 } }))
			const flow = createVerifyEmailFlow({ model, paths: PATHS })
			const { ctx } = makeCtx()

			await flow.routerVerifyEmail()(ctx)

			expect(tooMuchVerifyRequests.calledOnceWithExactly(EMAIL)).to.equal(true)
			expect(model.deleteOne.calledOnceWithExactly({ mail: EMAIL })).to.equal(true)
			expect(sendWelcome.called).to.equal(false)
		})

		it('a link older than 3 days deletes the pending account', async () => {
			const old = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
			const model = makeModel(makeDoc({ verification: { hash: HASH, dateLastReq: old, requestTimes: 1 } }))
			const flow = createVerifyEmailFlow({ model, paths: PATHS })
			const { ctx } = makeCtx()

			await flow.routerVerifyEmail()(ctx)

			expect(hashReqTooOld.calledOnceWithExactly(EMAIL)).to.equal(true)
			expect(model.deleteOne.calledOnceWithExactly({ mail: EMAIL })).to.equal(true)
			expect(sendWelcome.called).to.equal(false)
		})

		it('an unknown address redirects to the generic check page and enables nothing', async () => {
			const model = makeModel(null)
			const flow = createVerifyEmailFlow({ model, paths: PATHS })
			const { ctx, redirects } = makeCtx()

			await flow.routerVerifyEmail()(ctx)

			expect(model.updateOne.called).to.equal(false)
			// same answer as every other rejection — the router never says which one it was
			expect(redirects).to.deep.equal(['/x/email-check'])
		})
	})

	describe('emailChangeHashVerify', () => {
		it('accepts a free address: writes the custom email path and clears the container', async () => {
			const model = makeModel(makeDoc(), 0)
			const flow = createVerifyEmailFlow({ model, paths: PATHS })

			const ret = await flow.emailChangeHashVerify.resolve(null, { email: EMAIL, hash: HASH })

			expect(ret).to.equal(true)
			expect(model.findOne.calledOnceWithExactly({ 'verification.pending': EMAIL })).to.equal(true)
			expect(model.query.selected).to.equal(
				'_id verification.hash verification.dateLastReq verification.requestTimes flags.deleted flags.disabled'
			)
			expect(model.countDocuments.calledOnceWithExactly({ mail: EMAIL })).to.equal(true)

			const [, update] = model.updateOne.firstCall.args
			expect(update).to.deep.equal({ $set: { mail: EMAIL }, $unset: { verification: '' } })
		})

		it('refuses when the address got taken meanwhile', async () => {
			const model = makeModel(makeDoc(), 1)
			const flow = createVerifyEmailFlow({ model, paths: PATHS })

			expect(await flow.emailChangeHashVerify.resolve(null, { email: EMAIL, hash: HASH })).to.equal(false)
			expect(model.updateOne.called).to.equal(false)
		})

		it('a wrong hash bumps the strike counter on the custom path', async () => {
			const model = makeModel(makeDoc())
			const flow = createVerifyEmailFlow({ model, paths: PATHS })

			expect(await flow.emailChangeHashVerify.resolve(null, { email: EMAIL, hash: 'wrong' })).to.equal(false)
			const [, update] = model.updateOne.firstCall.args
			expect(update).to.deep.equal({ $inc: { 'verification.requestTimes': 1 } })
			expect(wrongHash.calledOnceWithExactly(EMAIL, 1)).to.equal(true)
		})
	})

	describe('onAbandon', () => {
		// The two abandonment guards used to hard-code deleteOne. For a row other collections hang off,
		// that is data loss with no cascade to undo it — and the returned flow member could not change it,
		// because the guards had already closed over the internal writer.
		const staleDoc = () => makeDoc({ verification: { hash: HASH, dateLastReq: new Date(), requestTimes: 5 } })

		it("defaults to 'delete', unchanged from before the option existed", async () => {
			const model = makeModel(staleDoc())
			const flow = createVerifyEmailFlow({ model, paths: PATHS, mailer: fakeVerifyEmailMailer() })

			await flow.routerVerifyEmail()(makeCtx().ctx)

			expect(model.deleteOne.calledOnceWithExactly({ mail: EMAIL })).to.equal(true)
		})

		it("'soft-delete' writes the deleted path and never calls deleteOne", async () => {
			const model = makeModel(staleDoc())
			const flow = createVerifyEmailFlow({
				model,
				paths: PATHS,
				onAbandon: 'soft-delete',
				mailer: fakeVerifyEmailMailer()
			})
			const { ctx, redirects } = makeCtx()

			await flow.routerVerifyEmail()(ctx)

			expect(model.deleteOne.called).to.equal(false)
			expect(model.updateOne.calledOnce).to.equal(true)
			expect(model.updateOne.firstCall.args[1]).to.deep.equal({ $set: { 'flags.deleted': true } })
			// disposal policy never decides whether the link is honoured
			expect(redirects).to.deep.equal(['/x/email-check'])
		})

		it("'soft-delete' with a deletedValue factory stores a timestamp rather than a boolean", async () => {
			const model = makeModel(staleDoc())
			const stamp = new Date('2026-03-03T00:00:00.000Z')
			const flow = createVerifyEmailFlow({
				model,
				paths: PATHS,
				onAbandon: 'soft-delete',
				deletedValue: () => stamp,
				mailer: fakeVerifyEmailMailer()
			})

			await flow.routerVerifyEmail()(makeCtx().ctx)

			expect(model.updateOne.firstCall.args[1]).to.deep.equal({ $set: { 'flags.deleted': stamp } })
		})

		it("'keep' disposes of nothing but still refuses the link", async () => {
			const model = makeModel(staleDoc())
			const flow = createVerifyEmailFlow({ model, paths: PATHS, onAbandon: 'keep', mailer: fakeVerifyEmailMailer() })
			const { ctx, redirects } = makeCtx()

			await flow.routerVerifyEmail()(ctx)

			expect(model.deleteOne.called).to.equal(false)
			expect(model.updateOne.called).to.equal(false)
			expect(redirects).to.deep.equal(['/x/email-check'])
		})

		it('an explicit deleteUserByEmail wins over onAbandon, and is what the guards actually call', async () => {
			const model = makeModel(staleDoc())
			const custom = sinon.stub().resolves()
			const flow = createVerifyEmailFlow({
				model,
				paths: PATHS,
				onAbandon: 'soft-delete',
				deleteUserByEmail: custom as never,
				mailer: fakeVerifyEmailMailer()
			})

			await flow.routerVerifyEmail()(makeCtx().ctx)

			expect(custom.calledOnceWithExactly(EMAIL)).to.equal(true)
			expect(model.deleteOne.called).to.equal(false)
			expect(model.updateOne.called).to.equal(false)
			// The returned member is the same writer the guards hold, so it reports the policy in force
			// instead of being a second, ignored copy.
			expect(flow.deleteUserByEmail).to.equal(custom)
		})

		it('the returned deleteUserByEmail is the writer the guards run, not a separate default', async () => {
			const model = makeModel(staleDoc())
			const flow = createVerifyEmailFlow({ model, paths: PATHS, onAbandon: 'soft-delete', mailer: fakeVerifyEmailMailer() })

			await flow.deleteUserByEmail(EMAIL)

			// soft-delete, exactly like the guard path above — not the hard delete of the old internal writer
			expect(model.deleteOne.called).to.equal(false)
			expect(model.updateOne.calledOnceWith({ mail: EMAIL })).to.equal(true)
		})
	})

	describe('mailer and mailThrottle', () => {
		it('routes every guard notification through an injected mailer', async () => {
			const mailer = fakeVerifyEmailMailer()
			const model = makeModel(makeDoc({ verified: true }))
			const flow = createVerifyEmailFlow({ model, paths: PATHS, mailer })

			await flow.routerVerifyEmail()(makeCtx().ctx)

			expect(mailer.emailAlreadyValid.calledOnceWithExactly(EMAIL)).to.equal(true)
			// nothing reached the real client
			expect(sendWelcome.called).to.equal(false)
		})

		it('debounces a repeated notification by default', async () => {
			const model = makeModel(makeDoc({ verified: true }))
			const flow = createVerifyEmailFlow({ model, paths: PATHS })

			await flow.routerVerifyEmail()(makeCtx().ctx)
			await flow.routerVerifyEmail()(makeCtx().ctx)

			// Same address, same template, same window: the second GET must not mail the account owner
			// again. Unauthenticated callers used to get one mail per request, unbounded.
			expect(alreadyValid.calledOnce).to.equal(true)
		})

		it('a per-flow throttle is not shared between flows', async () => {
			const first = createVerifyEmailFlow({ model: makeModel(makeDoc({ verified: true })), paths: PATHS })
			const second = createVerifyEmailFlow({ model: makeModel(makeDoc({ verified: true })), paths: PATHS })

			await first.routerVerifyEmail()(makeCtx().ctx)
			await second.routerVerifyEmail()(makeCtx().ctx)

			expect(alreadyValid.calledTwice).to.equal(true)
		})

		it('mailThrottle: ALWAYS_MAIL restores one mail per request', async () => {
			const model = makeModel(makeDoc({ verified: true }))
			const flow = createVerifyEmailFlow({ model, paths: PATHS, mailThrottle: ALWAYS_MAIL })

			await flow.routerVerifyEmail()(makeCtx().ctx)
			await flow.routerVerifyEmail()(makeCtx().ctx)

			expect(alreadyValid.calledTwice).to.equal(true)
		})
	})

	describe('setEmailHash', () => {
		it('writes hash, counter and date on the supplied paths', async () => {
			const model = makeModel(null)
			const flow = createVerifyEmailFlow({ model, paths: PATHS })
			const uId = new Types.ObjectId()

			const hash = await flow.setEmailHash(null as never, uId)

			expect(hash).to.be.a('string')
			const [filter, update, opts] = model.updateOne.firstCall.args
			expect(filter).to.deep.equal({ _id: uId })
			expect(update.$set['verification.hash']).to.equal(hash)
			expect(update.$set['verification.requestTimes']).to.equal(1)
			expect(update.$set['verification.dateLastReq']).to.be.instanceOf(Date)
			expect(opts.runValidators).to.equal(true)
		})
	})
})
