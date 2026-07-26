/**
 * Tests for private/lib/access/db/deleteUserByEmail.mts
 *
 * Chain: deleteUserByEmail(email) → UserBase.deleteOne({ 'login.email': email })
 *
 * `deletedCount === 0` goes to Sentry as a warning and the call still resolves — a guard's redirect must not
 * depend on the delete having matched. Sentry is never initialised in the suite, so `captureMessage` is a
 * no-op and the third test asserts the resolve rather than the report (`@sentry/node` is a sealed namespace
 * sinon cannot stub).
 */
import deleteUserByEmail from '@private/lib/access/db/deleteUserByEmail.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

// ---------------------------------------------------------------------------

describe('deleteUserByEmail', () => {
	let deleteOneStub: sinon.SinonStub

	beforeEach(() => {
		deleteOneStub = sinon.stub(UserBase, 'deleteOne').resolves({ acknowledged: true, deletedCount: 1 } as never)
	})

	afterEach(() => {
		sinon.restore()
	})

	it('calls UserBase.deleteOne with a login.email filter matching the given address', async () => {
		await deleteUserByEmail('user@test.com')

		expect(deleteOneStub.calledOnce).to.equal(true)
		expect(deleteOneStub.firstCall.args[0]).to.deep.equal({ 'login.email': 'user@test.com' })
	})

	it('resolves without returning a value when a matching user is deleted', async () => {
		const result = await deleteUserByEmail('user@test.com')

		expect(result).to.equal(undefined)
	})

	it('resolves without throwing when no user matches (deletedCount 0)', async () => {
		deleteOneStub.resolves({ acknowledged: true, deletedCount: 0 } as never)

		await deleteUserByEmail('nouser@test.com')

		expect(deleteOneStub.calledOnce).to.equal(true)
	})
})
