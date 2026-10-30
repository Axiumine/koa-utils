/**
 * Mutation-testing guards for graphQL/schema/mutations/resetPwd.mts
 *
 * Pin: arg schema type, throttle boundary (exactly 10 min = allowed), date parsing of a string
 * `resetDateReq` from a custom reader, mail failure (async reject + sync throw) → Sentry, still true.
 */
import { createResetPwdMutation } from '../../../../dist/graphQL/schema/mutations/resetPwd.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import mongoose, { Types } from 'mongoose'

import { ISentryProbe, startSentryProbe } from '../../../helpers/sentryProbeS2.mjs'

const NOW = new Date('2025-06-15T12:00:00.000Z')

function makeSession() {
	return {
		withTransaction: async (fn: () => Promise<void>) => {
			await fn()
		},
		endSession: sinon.stub().resolves()
	}
}

function build(resetDateReq: unknown, sendEmailReset: sinon.SinonStub = sinon.stub().resolves()) {
	const id = new Types.ObjectId()
	const saveResetReq = sinon.stub().resolves()
	const getResetPwd = sinon.stub().resolves({ _id: id, resetDateReq, resetHash: 'old', name: 'Ann' })
	const mutation = createResetPwdMutation({
		getResetPwd: getResetPwd as never,
		saveResetReq: saveResetReq as never,
		mailer: { sendEmailReset }
	})
	return { mutation, saveResetReq, sendEmailReset }
}

describe('resetPwd — mutation guards', () => {
	let clock: sinon.SinonFakeTimers
	let probe: ISentryProbe

	beforeEach(async () => {
		clock = sinon.useFakeTimers({ now: NOW, toFake: ['Date'] })
		sinon.stub(mongoose, 'startSession').resolves(makeSession() as never)
		probe = await startSentryProbe()
	})

	afterEach(async () => {
		await probe.stop()
		clock.restore()
		sinon.restore()
	})

	it('declares email as a non-null scalar, nothing else', () => {
		const { mutation } = build(undefined)
		expect(Object.keys(mutation.args)).to.deep.equal(['email'])
		expect(mutation.args.email.type.toString()).to.equal('String!')
	})

	it('a previous request exactly 10 minutes old is no longer throttled', async () => {
		const { mutation, saveResetReq, sendEmailReset } = build(new Date(NOW.getTime() - 10 * 60 * 1000))

		const result = await mutation.resolve(null, { email: 'u@test.com' })

		expect(result).to.equal(true)
		expect(saveResetReq.calledOnce).to.equal(true)
		expect(sendEmailReset.calledOnce).to.equal(true)
	})

	it('a previous request 9 min 59 s old is still throttled', async () => {
		const { mutation, saveResetReq, sendEmailReset } = build(new Date(NOW.getTime() - (10 * 60 - 1) * 1000))

		const result = await mutation.resolve(null, { email: 'u@test.com' })

		expect(result).to.equal(true)
		expect(saveResetReq.called).to.equal(false)
		expect(sendEmailReset.called).to.equal(false)
	})

	it('parses a string resetDateReq from a custom reader (ISO, 15 min old) → not throttled', async () => {
		const { mutation, saveResetReq, sendEmailReset } = build(new Date(NOW.getTime() - 15 * 60 * 1000).toISOString())

		await mutation.resolve(null, { email: 'u@test.com' })

		expect(saveResetReq.calledOnce).to.equal(true)
		expect(sendEmailReset.calledOnce).to.equal(true)
	})

	it('async mail failure: still true, error reported to Sentry', async () => {
		const { mutation } = build(undefined, sinon.stub().rejects(new Error('socketlabs async down')))

		const result = await mutation.resolve(null, { email: 'u@test.com' })
		await new Promise((resolve) => setImmediate(resolve))
		await probe.flush()

		expect(result).to.equal(true)
		expect(probe.texts()).to.deep.equal(['socketlabs async down'])
	})

	it('sync mail failure: still true, error reported to Sentry', async () => {
		const { mutation } = build(undefined, sinon.stub().throws(new Error('socketlabs sync boom')))

		const result = await mutation.resolve(null, { email: 'u@test.com' })
		await probe.flush()

		expect(result).to.equal(true)
		expect(probe.texts()).to.deep.equal(['socketlabs sync boom'])
	})
})
