/**
 * Mutation-testing guards for graphQL/schema/mutations/updatePassword.mts
 *
 * Pin: arg schema types, email normalisation, orphan-state Sentry reports (resetHash null /
 * resetDateReq null), 60 min boundary, string `resetDateReq` from a custom reader, write failure → 500
 * with no cleanup, confirmation-mail failure → Sentry + still true.
 *
 * Deps injected → no mongoose model stubs. Only `mongoose.startSession` + the mailer prototype stubbed.
 */
import { createUpdatePasswordMutation } from '../../../../dist/graphQL/schema/mutations/updatePassword.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import mongoose, { Types } from 'mongoose'

import { expectGraphQLErrorAsync } from '../../../helpers/assertGraphQLError.mjs'
import { ISentryProbe, startSentryProbe } from '../../../helpers/sentryProbeS2.mjs'

const NOW = new Date('2025-06-15T12:00:00.000Z')
const ARGS = { email: 'u@test.com', hash: 'goodHash', password: 'newpassword1' }

function makeSession() {
	return {
		withTransaction: async (fn: () => Promise<void>) => {
			await fn()
		},
		endSession: sinon.stub().resolves()
	}
}

function build(record: unknown, updatePasswordDbResult: unknown = { modifiedCount: 1 }) {
	const getResetPwd = sinon.stub().resolves(record)
	const updatePasswordDb = sinon.stub().resolves(updatePasswordDbResult)
	const removeResetReq = sinon.stub().resolves()
	const mutation = createUpdatePasswordMutation({
		getResetPwd: getResetPwd as never,
		updatePasswordDb: updatePasswordDb as never,
		removeResetReq: removeResetReq as never
	})
	return { mutation, getResetPwd, updatePasswordDb, removeResetReq }
}

function record(resetDateReq: unknown, resetHash: string | null = 'goodHash') {
	return { _id: new Types.ObjectId(), resetDateReq, resetHash, name: 'Ann' }
}

const minutesAgo = (min: number) => new Date(NOW.getTime() - min * 60 * 1000)

describe('updatePassword — mutation guards', () => {
	let clock: sinon.SinonFakeTimers
	let probe: ISentryProbe
	let confirmStub: sinon.SinonStub

	beforeEach(async () => {
		clock = sinon.useFakeTimers({ now: NOW, toFake: ['Date'] })
		sinon.stub(mongoose, 'startSession').resolves(makeSession() as never)
		confirmStub = sinon.stub(SocketLabsLib.prototype, 'sendResetPwdConfirmation').resolves()
		probe = await startSentryProbe()
	})

	afterEach(async () => {
		await probe.stop()
		clock.restore()
		sinon.restore()
	})

	it('declares email, hash and password as non-null scalars, nothing else', () => {
		const { mutation } = build(null)
		expect(Object.keys(mutation.args).sort()).to.deep.equal(['email', 'hash', 'password'])
		expect(mutation.args.email.type.toString()).to.equal('String!')
		expect(mutation.args.hash.type.toString()).to.equal('String!')
		expect(mutation.args.password.type.toString()).to.equal('String!')
	})

	it('trims + lowercases the email before lookup and before the confirmation mail', async () => {
		const { mutation, getResetPwd } = build(record(minutesAgo(1)))

		await mutation.resolve(null, { ...ARGS, email: '  U@Test.COM \t' })

		expect(getResetPwd.firstCall.args[1]).to.equal('u@test.com')
		expect(confirmStub.firstCall.args).to.deep.equal(['u@test.com', 'Ann'])
	})

	it('reset state without a usable hash: 403 and the orphan state reported to Sentry', async () => {
		const { mutation, updatePasswordDb } = build(record(minutesAgo(1), null))

		await expectGraphQLErrorAsync(() => mutation.resolve(null, { ...ARGS, hash: 'anything' }), 403, 'Forbidden')
		await probe.flush()

		expect(probe.texts()).to.deep.equal(['[updatePassword] no usable resetHash for u@test.com'])
		expect(updatePasswordDb.called).to.equal(false)
	})

	it('hash set but resetDateReq null: 403 and the inconsistency reported to Sentry', async () => {
		const { mutation, updatePasswordDb } = build(record(null))

		await expectGraphQLErrorAsync(() => mutation.resolve(null, ARGS), 403, 'Forbidden')
		await probe.flush()

		expect(probe.texts()).to.deep.equal(['[updatePassword] resetHash set but resetDateReq missing for u@test.com'])
		expect(updatePasswordDb.called).to.equal(false)
	})

	it('a link exactly 60 minutes old is still valid', async () => {
		const { mutation, updatePasswordDb } = build(record(minutesAgo(60)))

		const result = await mutation.resolve(null, ARGS)

		expect(result).to.equal(true)
		expect(updatePasswordDb.calledOnce).to.equal(true)
	})

	it('a link 61 minutes old is expired: 403, nothing written', async () => {
		const { mutation, updatePasswordDb } = build(record(minutesAgo(61)))

		await expectGraphQLErrorAsync(() => mutation.resolve(null, ARGS), 403, 'Forbidden')

		expect(updatePasswordDb.called).to.equal(false)
	})

	it('parses a string resetDateReq from a custom reader: 70 min old ISO → expired', async () => {
		const { mutation, updatePasswordDb } = build(record(minutesAgo(70).toISOString()))

		await expectGraphQLErrorAsync(() => mutation.resolve(null, ARGS), 403, 'Forbidden')

		expect(updatePasswordDb.called).to.equal(false)
	})

	it('parses a string resetDateReq from a custom reader: 5 min old ISO → accepted', async () => {
		const { mutation } = build(record(minutesAgo(5).toISOString()))

		expect(await mutation.resolve(null, ARGS)).to.equal(true)
	})

	it('password write returns falsy: 500, reset request not cleared, no mail', async () => {
		const { mutation, removeResetReq } = build(record(minutesAgo(1)), null)

		await expectGraphQLErrorAsync(() => mutation.resolve(null, ARGS), 500, 'Internal Server Error')

		expect(removeResetReq.called).to.equal(false)
		expect(confirmStub.called).to.equal(false)
	})

	it('confirmation mail failure: still true, the delivery error reported to Sentry', async () => {
		const { mutation } = build(record(minutesAgo(1)))
		confirmStub.rejects(new Error('socketlabs down'))

		const result = await mutation.resolve(null, ARGS)
		await probe.flush()

		expect(result).to.equal(true)
		expect(probe.texts()).to.deep.equal(['socketlabs down'])
	})
})
