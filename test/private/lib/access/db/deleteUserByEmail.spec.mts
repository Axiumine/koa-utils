/**
 * Tests for private/lib/access/db/deleteUserByEmail.mts
 *
 * Chain: deleteUserByEmail(email) → UserBase.deleteOne({ 'login.email': email })
 *
 * `deletedCount === 0` → Sentry warning, call still resolve — a guard's redirect must not depend on the
 * delete having matched. Sentry never init'd in the suite → `captureMessage` no-op → 3rd test assert the
 * resolve, not the report (`@sentry/node` = sealed namespace sinon cannot stub). Report itself pinned via
 * `probeSentry` (recording client, see test/helpers/sentryProbe.mts): warning on no match, silence on match.
 */
import deleteUserByEmail from '@private/lib/access/db/deleteUserByEmail.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

import { probeSentry } from '../../../../helpers/sentryProbe.mjs'

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

	it('reports a warning naming the path and the address when no user matches', async () => {
		deleteOneStub.resolves({ acknowledged: true, deletedCount: 0 } as never)

		const events = await probeSentry(() => deleteUserByEmail('nouser@test.com'))

		expect(events).to.deep.equal([
			{
				message: '[deleteUserByEmail] no document matched login.email = nouser@test.com',
				level: 'warning',
				exceptionMessage: undefined
			}
		])
	})

	it('reports nothing when the delete matched a user', async () => {
		const events = await probeSentry(() => deleteUserByEmail('user@test.com'))

		expect(events).to.deep.equal([])
	})
})
