/**
 * Tests for private/lib/access/db/userData4VerifyEmail.mts
 *
 * Chain: UserBase.findOne().select().lean()
 *
 * Branches:
 *   - user found (non-null) → returns the lean user document as-is
 *   - user === null → Sentry.captureMessage (no-op, non-stubbable in ESM) + throws Error(EMAIL_CHECK_LINK)
 */
import { userData4VerifyEmail } from '@private/lib/access/db/userData4VerifyEmail.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { EMAIL_CHECK_LINK } from '@private/lib/access/Constants.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

// ---------------------------------------------------------------------------

/** Chain for UserBase.findOne(...).select(...).lean() */
function makeFindOneChain(value: unknown) {
	return {
		select: () => ({
			lean: () => Promise.resolve(value)
		})
	}
}

function fakeUser(overrides: Record<string, unknown> = {}) {
	return {
		_id: new Types.ObjectId(),
		account: {
			email: {
				hash: 'somehash',
				valid: true,
				dateLastReq: new Date(),
				requestTimes: 1
			},
			deleted: false,
			disabled: false
		},
		...overrides
	}
}

// ---------------------------------------------------------------------------

describe('userData4VerifyEmail', () => {
	let findOneStub: sinon.SinonStub

	beforeEach(() => {
		findOneStub = sinon.stub(UserBase, 'findOne')
	})

	afterEach(() => {
		sinon.restore()
	})

	it('user found → returns the lean user document', async () => {
		const user = fakeUser()
		findOneStub.returns(makeFindOneChain(user))

		const result = await userData4VerifyEmail('found@test.com')

		expect(result).to.equal(user)
		expect(findOneStub.calledOnce).to.equal(true)
		expect(findOneStub.firstCall.args[0]).to.deep.equal({ 'login.email': 'found@test.com' })
	})

	it('user not found (null) → throws Error(EMAIL_CHECK_LINK)', async () => {
		findOneStub.returns(makeFindOneChain(null))

		let thrown: Error | undefined
		try {
			await userData4VerifyEmail('missing@test.com')
		} catch (e) {
			thrown = e as Error
		}

		expect(thrown).to.be.an('error')
		expect(thrown?.message).to.equal(EMAIL_CHECK_LINK)
	})
})
