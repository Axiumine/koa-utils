/**
 * Tests for lib/access/createResetPwdFlow.mts
 *
 * The point of the factory is that NOTHING about the account layout is baked in. So the whole flow is
 * driven here against a model that shares no field path with UserBase, and every read and write is
 * asserted against the supplied map.
 *
 * The `resetClear` case is the one that motivated the design: this layout stores the request as one
 * all-or-nothing subdocument, so the only legal cleanup is `$unset: { resetPwd: '' }` — the container,
 * not its two members.
 */
import { createResetPwdFlow } from '../../../dist/lib/access/createResetPwdFlow.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { expect } from 'chai'
import mongoose, { Types } from 'mongoose'
import sinon from 'sinon'

const EMAIL = 'user@example.com'
const HASH = 'the-stored-reset-hash'
const PASSWORD = 'aStrongPassword1!'

/** A layout with no field in common with UserBase, and a required-members reset subdocument. */
const PATHS = {
	email: 'mail',
	password: 'pwd',
	name: 'profile.fullName',
	resetDateReq: 'resetPwd.resetDateReq',
	resetHash: 'resetPwd.resetHash',
	deleted: 'state.gone',
	disabled: 'state.locked',
	resetClear: ['resetPwd']
}

function makeSession() {
	return {
		withTransaction: async (fn: () => Promise<void>) => {
			await fn()
		},
		endSession: sinon.stub().resolves()
	}
}

function makeModel(doc: unknown) {
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
		updateOne: sinon.stub().returns(updateQuery)
	} as never
}

/** The stored document, in the custom layout. */
function makeDoc(resetDateReq?: Date) {
	return {
		_id: new Types.ObjectId(),
		profile: { fullName: 'Test User' },
		resetPwd: typeof resetDateReq === 'undefined' ? undefined : { resetDateReq, resetHash: HASH }
	}
}

describe('createResetPwdFlow', () => {
	let sendEmailReset: sinon.SinonStub
	let sendResetPwdConfirmation: sinon.SinonStub

	beforeEach(() => {
		sinon.stub(mongoose, 'startSession').resolves(makeSession() as never)
		sendEmailReset = sinon.stub(SocketLabsLib.prototype, 'sendEmailReset').resolves()
		sendResetPwdConfirmation = sinon.stub(SocketLabsLib.prototype, 'sendResetPwdConfirmation').resolves()
	})

	afterEach(() => sinon.restore())

	it('returns both mutations, shaped like every other mutation in the schema', () => {
		const flow = createResetPwdFlow({ model: makeModel(null), paths: PATHS })

		for (const mutation of [flow.resetPwd, flow.updatePassword]) {
			expect(mutation.description).to.be.a('string')
			expect(mutation.resolve).to.be.a('function')
			expect(mutation.args).to.be.an('object')
		}
		expect(Object.keys(flow.updatePassword.args)).to.deep.equal(['email', 'hash', 'password'])
	})

	it('with no paths at all falls back to the UserBase layout', () => {
		const model = makeModel(null)
		const flow = createResetPwdFlow({ model })

		return flow.resetPwd.resolve(null, { email: EMAIL }).then(() => {
			expect(model.findOne.firstCall.args[0]).to.deep.equal({ 'login.email': EMAIL })
			expect(model.query.selected).to.equal(
				'_id personalData.name account.resetDateReq account.resetHash account.deleted account.disabled'
			)
		})
	})

	describe('resetPwd', () => {
		it('reads and writes through the supplied paths', async () => {
			const model = makeModel(makeDoc())
			const flow = createResetPwdFlow({ model, paths: PATHS })

			const ret = await flow.resetPwd.resolve(null, { email: 'USER@Example.com ' })

			expect(ret).to.equal(true)
			// lookup and projection follow the map, not UserBase
			expect(model.findOne.calledOnceWithExactly({ mail: EMAIL })).to.equal(true)
			expect(model.query.selected).to.equal(
				'_id profile.fullName resetPwd.resetDateReq resetPwd.resetHash state.gone state.locked'
			)

			// the write sets the two leaf paths
			const [, update] = model.updateOne.firstCall.args
			expect(Object.keys(update.$set)).to.deep.equal(['resetPwd.resetDateReq', 'resetPwd.resetHash'])
			expect(update.$set['resetPwd.resetHash']).to.be.a('string')

			// the name reaches the email from the custom path
			expect(sendEmailReset.calledOnce).to.equal(true)
			expect(sendEmailReset.firstCall.args[0]).to.equal(EMAIL)
			expect(sendEmailReset.firstCall.args[2]).to.equal('Test User')
		})

		it('unknown address writes nothing, sends nothing and still answers true', async () => {
			const model = makeModel(null)
			const flow = createResetPwdFlow({ model, paths: PATHS })

			expect(await flow.resetPwd.resolve(null, { email: EMAIL })).to.equal(true)
			expect(model.updateOne.called).to.equal(false)
			expect(sendEmailReset.called).to.equal(false)
		})

		it('honours the 10-minute throttle read from the custom date path', async () => {
			const model = makeModel(makeDoc(new Date()))
			const flow = createResetPwdFlow({ model, paths: PATHS })

			expect(await flow.resetPwd.resolve(null, { email: EMAIL })).to.equal(true)
			expect(model.updateOne.called).to.equal(false)
			expect(sendEmailReset.called).to.equal(false)
		})

		it('mints no link for a deleted account, and is indistinguishable from an unknown address', async () => {
			// no pending request, so the only thing stopping the link is the flag read from state.gone
			const model = makeModel({ ...makeDoc(), state: { gone: true } })
			const flow = createResetPwdFlow({ model, paths: PATHS })

			expect(await flow.resetPwd.resolve(null, { email: EMAIL })).to.equal(true)
			expect(model.updateOne.called).to.equal(false)
			expect(sendEmailReset.called).to.equal(false)
		})

		it('mints no link for a disabled account either', async () => {
			const model = makeModel({ ...makeDoc(), state: { locked: true } })
			const flow = createResetPwdFlow({ model, paths: PATHS })

			expect(await flow.resetPwd.resolve(null, { email: EMAIL })).to.equal(true)
			expect(model.updateOne.called).to.equal(false)
			expect(sendEmailReset.called).to.equal(false)
		})
	})

	describe('updatePassword', () => {
		it('hashes into the custom password path and clears exactly the resetClear paths', async () => {
			const model = makeModel(makeDoc(new Date()))
			const flow = createResetPwdFlow({ model, paths: PATHS })

			const ret = await flow.updatePassword.resolve(null, { email: EMAIL, hash: HASH, password: PASSWORD })

			expect(ret).to.equal(true)

			const [pwdFilter, pwdUpdate] = model.updateOne.firstCall.args
			expect(Object.keys(pwdFilter)).to.deep.equal(['_id'])
			expect(Object.keys(pwdUpdate.$set)).to.deep.equal(['pwd'])
			expect(pwdUpdate.$set.pwd).to.not.equal(PASSWORD) // bcrypt hash, never the plaintext

			// the cleanup unsets the container, NOT the two leaves it read: unsetting a member of a
			// required-members subdocument leaves an invalid document and the write is rejected
			const [clearFilter, clearUpdate] = model.updateOne.secondCall.args
			expect(clearFilter).to.deep.equal({ mail: EMAIL })
			expect(clearUpdate).to.deep.equal({ $unset: { resetPwd: '' } })

			expect(sendResetPwdConfirmation.calledOnceWithExactly(EMAIL, 'Test User')).to.equal(true)
		})

		it('rejects a wrong hash without touching the account', async () => {
			const model = makeModel(makeDoc(new Date()))
			const flow = createResetPwdFlow({ model, paths: PATHS })

			let thrown: unknown = null
			try {
				await flow.updatePassword.resolve(null, { email: EMAIL, hash: 'wrong', password: PASSWORD })
			} catch (e: unknown) {
				thrown = e
			}
			expect(thrown).to.not.equal(null)
			expect(model.updateOne.called).to.equal(false)
			expect(sendResetPwdConfirmation.called).to.equal(false)
		})

		it('refuses a deleted or disabled account holding a valid, unexpired hash', async () => {
			// The hash is genuine and in date — only the account state stops the write. Without the gate
			// the bcrypt slot of a tombstoned account was overwritten, so re-enabling it later handed the
			// account back with a password the requester chose.
			for (const state of [{ gone: true }, { locked: true }]) {
				const model = makeModel({ ...makeDoc(new Date()), state })
				const flow = createResetPwdFlow({ model, paths: PATHS })

				let thrown: unknown = null
				try {
					await flow.updatePassword.resolve(null, { email: EMAIL, hash: HASH, password: PASSWORD })
				} catch (e: unknown) {
					thrown = e
				}
				expect(thrown).to.not.equal(null)
				expect(model.updateOne.called).to.equal(false)
				expect(sendResetPwdConfirmation.called).to.equal(false)
			}
		})

		it('rejects an unknown address the same way, so the two are indistinguishable', async () => {
			const model = makeModel(null)
			const flow = createResetPwdFlow({ model, paths: PATHS })

			let thrown: unknown = null
			try {
				await flow.updatePassword.resolve(null, { email: EMAIL, hash: HASH, password: PASSWORD })
			} catch (e: unknown) {
				thrown = e
			}
			expect(thrown).to.not.equal(null)
			expect(model.updateOne.called).to.equal(false)
		})
	})
})
