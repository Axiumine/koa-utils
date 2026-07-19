/**
 * Tests for private/lib/access/handleIfHashBad.mts
 *
 * Chain: incReqTimes(UserBase.updateOne) → SocketLabsLib.wrongHash → throw Error(EMAIL_CHECK_LINK)
 *
 * Branches:
 *   - hash !== dbHash → incReqTimes + wrongHash(uEmail, requestTimes + 1) → throws Error(EMAIL_CHECK_LINK)
 *   - hash !== dbHash with default requestTimes (param omitted) → wrongHash called with 1
 *   - hash === dbHash → resolves, no side effects
 */
import { handleIfHashBad } from '@private/lib/access/handleIfHashBad.mjs'
import { EMAIL_CHECK_LINK } from '@private/lib/access/Constants.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

// ---------------------------------------------------------------------------

describe('handleIfHashBad', () => {
	let updateOneStub: sinon.SinonStub
	let wrongHashStub: sinon.SinonStub

	beforeEach(() => {
		updateOneStub = sinon.stub(UserBase, 'updateOne').resolves({ modifiedCount: 1 } as never)
		wrongHashStub = sinon.stub(SocketLabsLib.prototype, 'wrongHash').resolves()
	})

	afterEach(() => {
		sinon.restore()
	})

	it('hash mismatch → increments requestTimes, sends wrongHash email, throws EMAIL_CHECK_LINK error', async () => {
		const uId = new Types.ObjectId()

		let caught: unknown
		try {
			await handleIfHashBad({ uId, uEmail: 'user@test.com', hash: 'wrongHash', requestTimes: 3, dbHash: 'correctHash' })
		} catch (e) {
			caught = e
		}

		expect(caught).to.be.instanceOf(Error)
		expect((caught as Error).message).to.equal(EMAIL_CHECK_LINK)
		expect(updateOneStub.calledOnce).to.equal(true)
		expect(updateOneStub.firstCall.args[0]).to.deep.equal({ _id: uId })
		expect(wrongHashStub.calledOnce).to.equal(true)
		expect(wrongHashStub.firstCall.args).to.deep.equal(['user@test.com', 4])
	})

	it('hash mismatch with dbHash undefined → still throws and sends wrongHash email', async () => {
		const uId = new Types.ObjectId()

		let caught: unknown
		try {
			await handleIfHashBad({ uId, uEmail: 'user@test.com', hash: 'someHash', requestTimes: 0, dbHash: undefined })
		} catch (e) {
			caught = e
		}

		expect(caught).to.be.instanceOf(Error)
		expect((caught as Error).message).to.equal(EMAIL_CHECK_LINK)
		expect(wrongHashStub.firstCall.args).to.deep.equal(['user@test.com', 1])
	})

	it('hash mismatch with requestTimes omitted (default 0) → wrongHash called with 1', async () => {
		const uId = new Types.ObjectId()

		let caught: unknown
		try {
			await handleIfHashBad({ uId, uEmail: 'user@test.com', hash: 'wrongHash', requestTimes: undefined, dbHash: 'correctHash' })
		} catch (e) {
			caught = e
		}

		expect(caught).to.be.instanceOf(Error)
		expect(wrongHashStub.firstCall.args).to.deep.equal(['user@test.com', 1])
	})

	it('hash matches dbHash → resolves without throwing and without side effects', async () => {
		const uId = new Types.ObjectId()

		const result = await handleIfHashBad({ uId, uEmail: 'user@test.com', hash: 'sameHash', requestTimes: 2, dbHash: 'sameHash' })

		expect(result).to.equal(undefined)
		expect(updateOneStub.called).to.equal(false)
		expect(wrongHashStub.called).to.equal(false)
	})
})
