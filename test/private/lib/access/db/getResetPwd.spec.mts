/**
 * Tests for private/lib/access/db/getResetPwd.mts
 *
 * Chain: UserBase.findOne().select().session().lean()
 *
 * Branches:
 *   - queryRet === null (no reset request found) → returns null
 *   - queryRet !== null + resetDateReq !== undefined + resetHash is a string → resetHash = that hash
 *   - queryRet !== null + resetDateReq !== undefined + resetHash absent → resetHash stays null
 *   - queryRet !== null + resetDateReq === undefined → resetHash stays null
 *   - queryRet.personalData?.name defined (truthy) → name used as-is
 *   - queryRet.personalData is undefined → name falls back to ''
 *
 * The token lives in account.resetHash, NOT account.email.hash. Reading the verification slot is
 * what let a hash minted by signUp / emailChange authenticate a password reset, so the projection
 * itself is pinned below.
 */
import { getResetPwd } from '@private/lib/access/db/getResetPwd.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

// ---------------------------------------------------------------------------

/** Projection string handed to .select() by the last makeFindOneChain() consumer. */
let selectedFields = ''

/** Chain for UserBase.findOne(...).select(...).session(...).lean() */
function makeFindOneChain(value: unknown) {
	return {
		select: (fields: string) => {
			selectedFields = fields
			return {
				session: () => ({
					lean: () => Promise.resolve(value)
				})
			}
		}
	}
}

// ---------------------------------------------------------------------------

describe('getResetPwd', () => {
	let findOneStub: sinon.SinonStub
	const fakeSession = {} as never

	beforeEach(() => {
		selectedFields = ''
		findOneStub = sinon.stub(UserBase, 'findOne')
	})

	afterEach(() => {
		sinon.restore()
	})

	it('no reset request found (queryRet === null) → returns null', async () => {
		findOneStub.returns(makeFindOneChain(null))

		const result = await getResetPwd(fakeSession, 'missing@test.com')

		expect(result).to.equal(null)
		expect(findOneStub.calledOnce).to.equal(true)
		expect(findOneStub.firstCall.args[0]).to.deep.equal({ 'login.email': 'missing@test.com' })
	})

	it('projects account.resetHash and never the shared account.email.hash slot', async () => {
		findOneStub.returns(makeFindOneChain(null))

		await getResetPwd(fakeSession, 'user@test.com')

		expect(selectedFields.split(/\s+/)).to.include('account.resetHash')
		expect(selectedFields).to.not.include('account.email.hash')
	})

	it('reset request found + resetDateReq defined + personalData.name defined → full object with string resetHash', async () => {
		const id = new Types.ObjectId()
		const resetDateReq = new Date()
		findOneStub.returns(
			makeFindOneChain({
				_id: id,
				personalData: { name: 'Alice' },
				account: { resetDateReq, resetHash: 'abc12345' }
			})
		)

		const result = await getResetPwd(fakeSession, 'user@test.com')

		expect(result).to.deep.equal({
			_id: id,
			resetDateReq,
			resetHash: 'abc12345',
			name: 'Alice'
		})
	})

	it('SECURITY: resetDateReq defined but hash cleared → resetHash null, never the string "undefined"', async () => {
		// Orphan state: account.resetDateReq survives a write that dropped account.resetHash.
		// The previous '' + hash produced the literal "undefined", which updatePassword accepted
		// as a match against a caller sending that same literal — a takeover needing no secret.
		const id = new Types.ObjectId()
		const resetDateReq = new Date()
		findOneStub.returns(
			makeFindOneChain({
				_id: id,
				personalData: { name: 'Bob' },
				account: { resetDateReq }
			})
		)

		const result = await getResetPwd(fakeSession, 'victim@test.com')

		expect(result).to.deep.equal({
			_id: id,
			resetDateReq,
			resetHash: null,
			name: 'Bob'
		})
		expect(result?.resetHash).to.not.equal('undefined')
	})

	it('SECURITY: a live account.email.hash never stands in for a missing account.resetHash', async () => {
		// The verification slot is filled by signUp and by the email-change flow. Falling back to it
		// would let a hash the user already received in an activation link reset their password —
		// and, worse, let a pending email-change hash do the same. Reset must fail closed instead.
		const id = new Types.ObjectId()
		const resetDateReq = new Date()
		findOneStub.returns(
			makeFindOneChain({
				_id: id,
				personalData: { name: 'Dave' },
				account: { resetDateReq, email: { hash: 'verification-hash' } }
			})
		)

		const result = await getResetPwd(fakeSession, 'user4@test.com')

		expect(result?.resetHash).to.equal(null)
	})

	it('resetDateReq defined but resetHash is a non-string value → resetHash null (fails closed)', async () => {
		// The schema types resetHash as String, so a non-string can only come from a write that
		// bypassed Mongoose. Coercing it would mint a reset token from whatever landed there.
		const id = new Types.ObjectId()
		const resetDateReq = new Date()
		findOneStub.returns(
			makeFindOneChain({
				_id: id,
				personalData: { name: 'Carol' },
				account: { resetDateReq, resetHash: 12345 }
			})
		)

		const result = await getResetPwd(fakeSession, 'user3@test.com')

		expect(result?.resetHash).to.equal(null)
	})

	it('reset request found + resetDateReq undefined + personalData undefined → resetHash null, name defaults to empty string', async () => {
		const id = new Types.ObjectId()
		findOneStub.returns(
			makeFindOneChain({
				_id: id,
				account: { resetDateReq: undefined, resetHash: 'unused' }
			})
		)

		const result = await getResetPwd(fakeSession, 'user2@test.com')

		expect(result).to.deep.equal({
			_id: id,
			resetDateReq: undefined,
			resetHash: null,
			name: ''
		})
	})
})
