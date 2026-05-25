/**
 * Tests for graphQL/schema/mutations/emailChangeHashVerify.mts
 *
 * Branches:
 *   - user === null (email not found) → returns false
 *   - hash matches + dateLastReq undefined → throws 500
 *   - hash matches + link too old (> 3 days) → returns false, sends hashReqTooOld email
 *   - hash matches + link fresh + account.deleted → returns false
 *   - hash matches + link fresh + account.disabled → returns false, sends accountDisabled email
 *   - hash matches + link fresh + valid + qty > 0 (email taken) → returns false
 *   - hash matches + link fresh + valid + qty = 0 → confirmNewEmail → returns true
 *   - hash mismatch + requestTimes undefined → throws 500
 *   - hash mismatch + requestTimes defined → incReqTimes + sends wrongHash → returns false
 *
 * emailChangeHashVerify does NOT use mongoose.startSession — it uses direct model calls.
 */
import { emailChangeHashVerify } from '../../../../dist/graphQL/schema/mutations/emailChangeHashVerify.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

import { expectGraphQLErrorAsync } from '../../../helpers/assertGraphQLError.mjs'

// ---------------------------------------------------------------------------

/** Chain for countDocuments */
function makeCountQuery(count: number) {
	return Promise.resolve(count)
}

/** Chain for UserBase.updateOne (used by confirmNewEmail and incReqTimes — no session chaining) */
function makeExecChain() {
	const q = {
		exec: () => Promise.resolve({ modifiedCount: 1 })
	}
	return q
}

/**
 * Build a fake user document as returned by:
 *   UserBase.findOne({ 'account.email.newEmailTmp': uEmail })
 *     .select('_id account.email.hash account.email.dateLastReq account.deleted account.disabled')
 *     .lean()
 *
 * Note: The chain is findOne().select().lean(), so we need:
 *   findOneStub.returns({ select() { return { lean() { return Promise.resolve(doc) } } } })
 */
function makeFindOneChain(value: unknown) {
	return {
		select: () => ({
			lean: () => Promise.resolve(value)
		})
	}
}

function fakeUser(overrides: {
	hash?: string
	dateLastReq?: Date
	requestTimes?: number
	deleted?: boolean
	disabled?: boolean
} = {}) {
	return {
		_id: new Types.ObjectId(),
		account: {
			email: {
				hash: overrides.hash ?? 'correctHash',
				dateLastReq: overrides.dateLastReq ?? new Date(),
				requestTimes: overrides.requestTimes ?? 1
			},
			deleted: overrides.deleted ?? false,
			disabled: overrides.disabled ?? false
		}
	}
}

// ---------------------------------------------------------------------------

describe('emailChangeHashVerify — resolve', () => {
	let findOneStub: sinon.SinonStub
	let countDocumentsStub: sinon.SinonStub
	let updateOneStub: sinon.SinonStub
	let hashReqTooOldStub: sinon.SinonStub
	let accountDisabledStub: sinon.SinonStub
	let wrongHashStub: sinon.SinonStub

	beforeEach(() => {
		findOneStub = sinon.stub(UserBase, 'findOne')
		countDocumentsStub = sinon.stub(UserBase, 'countDocuments')
		updateOneStub = sinon.stub(UserBase, 'updateOne').returns(makeExecChain() as never)
		hashReqTooOldStub = sinon.stub(SocketLabsLib.prototype, 'hashReqTooOld').resolves()
		accountDisabledStub = sinon.stub(SocketLabsLib.prototype, 'accountDisabled').resolves()
		wrongHashStub = sinon.stub(SocketLabsLib.prototype, 'wrongHash').resolves()
	})

	afterEach(() => {
		sinon.restore()
	})

	// -------------------------------------------------------------------------
	// email not found
	// -------------------------------------------------------------------------

	it('user not found → returns false', async () => {
		findOneStub.returns(makeFindOneChain(null))

		const result = await emailChangeHashVerify.resolve(null, { email: 'x@test.com', hash: 'h' })

		expect(result).to.equal(false)
	})

	// -------------------------------------------------------------------------
	// hash matches
	// -------------------------------------------------------------------------

	it('hash matches + dateLastReq undefined → throws 500 Internal Server Error', async () => {
		const user = fakeUser({ hash: 'correctHash' })
		// remove dateLastReq so it is undefined
		delete (user.account.email as { dateLastReq?: string }).dateLastReq
		findOneStub.returns(makeFindOneChain(user))

		await expectGraphQLErrorAsync(
			() => emailChangeHashVerify.resolve(null, { email: 'u@test.com', hash: 'correctHash' }),
			500,
			'Internal Server Error'
		)
	})

	it('hash matches + link too old (> 3 days) → returns false and sends hashReqTooOld', async () => {
		// 4 days ago — must be a Date object (isoToTimestamp calls .getTime())
		const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
		findOneStub.returns(makeFindOneChain(fakeUser({ hash: 'correctHash', dateLastReq: fourDaysAgo })))

		const result = await emailChangeHashVerify.resolve(null, { email: 'u@test.com', hash: 'correctHash' })

		expect(result).to.equal(false)
		expect(hashReqTooOldStub.calledOnce).to.equal(true)
	})

	it('hash matches + fresh link + account.deleted → returns false', async () => {
		findOneStub.returns(makeFindOneChain(fakeUser({ hash: 'correctHash', deleted: true })))

		const result = await emailChangeHashVerify.resolve(null, { email: 'u@test.com', hash: 'correctHash' })

		expect(result).to.equal(false)
		expect(accountDisabledStub.called).to.equal(false)
	})

	it('hash matches + fresh link + account.disabled → returns false and sends accountDisabled', async () => {
		findOneStub.returns(makeFindOneChain(fakeUser({ hash: 'correctHash', disabled: true })))

		const result = await emailChangeHashVerify.resolve(null, { email: 'u@test.com', hash: 'correctHash' })

		expect(result).to.equal(false)
		expect(accountDisabledStub.calledOnce).to.equal(true)
	})

	it('hash matches + fresh link + valid + email already taken (qty > 0) → returns false', async () => {
		findOneStub.returns(makeFindOneChain(fakeUser({ hash: 'correctHash' })))
		countDocumentsStub.returns(makeCountQuery(1))

		const result = await emailChangeHashVerify.resolve(null, { email: 'taken@test.com', hash: 'correctHash' })

		expect(result).to.equal(false)
		expect(updateOneStub.called).to.equal(false)
	})

	it('hash matches + fresh link + valid + email free (qty = 0) → confirmNewEmail → returns true', async () => {
		findOneStub.returns(makeFindOneChain(fakeUser({ hash: 'correctHash' })))
		countDocumentsStub.returns(makeCountQuery(0))

		const result = await emailChangeHashVerify.resolve(null, { email: 'free@test.com', hash: 'correctHash' })

		expect(result).to.equal(true)
		expect(updateOneStub.calledOnce).to.equal(true)
	})

	// -------------------------------------------------------------------------
	// hash mismatch
	// -------------------------------------------------------------------------

	it('hash mismatch + requestTimes undefined → throws 500 Internal Server Error', async () => {
		const user = fakeUser({ hash: 'differentHash' })
		delete (user.account.email as { requestTimes?: number }).requestTimes
		findOneStub.returns(makeFindOneChain(user))

		await expectGraphQLErrorAsync(
			() => emailChangeHashVerify.resolve(null, { email: 'u@test.com', hash: 'wrongHash' }),
			500,
			'Internal Server Error'
		)
	})

	it('hash mismatch + requestTimes defined → incReqTimes + sends wrongHash → returns false', async () => {
		findOneStub.returns(makeFindOneChain(fakeUser({ hash: 'differentHash', requestTimes: 2 })))

		const result = await emailChangeHashVerify.resolve(null, { email: 'u@test.com', hash: 'wrongHash' })

		expect(result).to.equal(false)
		expect(updateOneStub.calledOnce).to.equal(true) // incReqTimes
		expect(wrongHashStub.calledOnce).to.equal(true)
		expect(wrongHashStub.firstCall.args[1]).to.equal(2)
	})
})
