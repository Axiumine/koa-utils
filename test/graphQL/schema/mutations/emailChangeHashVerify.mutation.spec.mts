/**
 * Mutation-testing guards for graphQL/schema/mutations/emailChangeHashVerify.mts
 *
 * Pin: arg schema types, 3-day freshness boundary (exactly 3 days old = still valid).
 */
import { createEmailChangeHashVerifyMutation } from '../../../../dist/graphQL/schema/mutations/emailChangeHashVerify.mjs'
import { DEFAULT_VERIFY_EMAIL_PATHS } from '@lib/access/accessPaths.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

import { fakeVerifyEmailMailer } from '../../../helpers/fakeVerifyEmailMailer.mjs'

function build(dateLastReq: Date) {
	const user = {
		_id: new Types.ObjectId(),
		account: {
			email: { hash: 'correctHash', dateLastReq, requestTimes: 1 },
			deleted: false,
			disabled: false
		}
	}
	const model = {
		findOne: () => ({ select: () => ({ lean: () => Promise.resolve(user) }) }),
		countDocuments: sinon.stub().resolves(0)
	}
	const mailer = fakeVerifyEmailMailer()
	const confirmNewEmail = sinon.stub().resolves()
	const mutation = createEmailChangeHashVerifyMutation({
		model: model as never,
		paths: DEFAULT_VERIFY_EMAIL_PATHS,
		confirmNewEmail,
		incReqTimes: sinon.stub().resolves(),
		mailer
	})
	return { mutation, mailer, confirmNewEmail }
}

describe('emailChangeHashVerify — mutation guards', () => {
	let clock: sinon.SinonFakeTimers

	beforeEach(() => {
		clock = sinon.useFakeTimers({ now: new Date('2025-06-15T12:00:00.000Z'), toFake: ['Date'] })
	})

	afterEach(() => {
		clock.restore()
		sinon.restore()
	})

	it('declares email + hash as non-null scalars, nothing else', () => {
		const { mutation } = build(new Date())
		expect(Object.keys(mutation.args).sort()).to.deep.equal(['email', 'hash'])
		expect(mutation.args.email.type.toString()).to.equal('String!')
		expect(mutation.args.hash.type.toString()).to.equal('String!')
	})

	it('a request exactly 3 days old is still accepted (limit is strictly older than 3 days)', async () => {
		// same arithmetic as resolver → cutoff instant, equal to the stored timestamp
		const now = new Date()
		const cutoff = new Date(now.setDate(now.getDate() - 3))
		const { mutation, mailer, confirmNewEmail } = build(cutoff)

		const result = await mutation.resolve(null, { email: 'new@test.com', hash: 'correctHash' })

		expect(result).to.equal(true)
		expect(mailer.hashReqTooOld.called).to.equal(false)
		expect(confirmNewEmail.calledOnce).to.equal(true)
	})

	it('a request 1 ms older than 3 days is rejected', async () => {
		const now = new Date()
		const cutoff = new Date(now.setDate(now.getDate() - 3))
		const { mutation, mailer, confirmNewEmail } = build(new Date(cutoff.getTime() - 1))

		const result = await mutation.resolve(null, { email: 'new@test.com', hash: 'correctHash' })

		expect(result).to.equal(false)
		expect(mailer.hashReqTooOld.calledOnceWithExactly('new@test.com')).to.equal(true)
		expect(confirmNewEmail.called).to.equal(false)
	})
})
