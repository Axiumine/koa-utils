/**
 * Tests for private/lib/access/applyPasswordReset.mts
 *
 * Chain: getResetPwd → assertResetAllowed → updatePasswordDb → removeResetReq → return name
 *
 * Branches:
 * - assertResetAllowed throw → propagate, no write, no cleanup
 * - updatePasswordDb falsy → 500, cleanup skipped
 * - happy → writer get (session, _id, password), cleanup get (session, uEmail), return name
 *
 * Rejection reasons themselves pinned in assertResetAllowed.spec.mts.
 */
import { applyPasswordReset } from '@private/lib/access/applyPasswordReset.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { ClientSession, Types } from 'mongoose'

import { expectGraphQLErrorAsync } from '../../../helpers/assertGraphQLError.mjs'

// ---------------------------------------------------------------------------

const session = { id: 'fake-session' } as unknown as ClientSession
const INPUT = { uEmail: 'u@test.com', hash: 'goodHash', password: 'newpassword1' }

function build(record: unknown, writeResult: unknown = { modifiedCount: 1 }) {
	const getResetPwd = sinon.stub().resolves(record)
	const updatePasswordDb = sinon.stub().resolves(writeResult)
	const removeResetReq = sinon.stub().resolves()
	const deps = {
		getResetPwd: getResetPwd as never,
		updatePasswordDb: updatePasswordDb as never,
		removeResetReq: removeResetReq as never
	}
	return { deps, getResetPwd, updatePasswordDb, removeResetReq }
}

describe('applyPasswordReset', () => {
	it('reads the record with session + email, writes, clears, returns the holder name', async () => {
		const _id = new Types.ObjectId()
		const { deps, getResetPwd, updatePasswordDb, removeResetReq } = build({
			_id,
			resetDateReq: new Date(),
			resetHash: 'goodHash',
			name: 'Ann'
		})

		const name = await applyPasswordReset(deps, session, INPUT)

		expect(name).to.equal('Ann')
		expect(getResetPwd.firstCall.args).to.deep.equal([session, 'u@test.com'])
		expect(updatePasswordDb.firstCall.args).to.deep.equal([session, _id, 'newpassword1'])
		expect(removeResetReq.firstCall.args).to.deep.equal([session, 'u@test.com'])
	})

	it('wrong hash → 403, nothing written, nothing cleared', async () => {
		const { deps, updatePasswordDb, removeResetReq } = build({
			_id: new Types.ObjectId(),
			resetDateReq: new Date(),
			resetHash: 'otherHash',
			name: 'Ann'
		})

		await expectGraphQLErrorAsync(() => applyPasswordReset(deps, session, INPUT), 403, 'Forbidden')

		expect(updatePasswordDb.called).to.equal(false)
		expect(removeResetReq.called).to.equal(false)
	})

	it('unknown address → 403, nothing written', async () => {
		const { deps, updatePasswordDb } = build(null)

		await expectGraphQLErrorAsync(() => applyPasswordReset(deps, session, INPUT), 403, 'Forbidden')

		expect(updatePasswordDb.called).to.equal(false)
	})

	it('writer resolves falsy → 500, cleanup skipped', async () => {
		const { deps, removeResetReq } = build(
			{ _id: new Types.ObjectId(), resetDateReq: new Date(), resetHash: 'goodHash', name: 'Ann' },
			null
		)

		await expectGraphQLErrorAsync(() => applyPasswordReset(deps, session, INPUT), 500, 'Internal Server Error')

		expect(removeResetReq.called).to.equal(false)
	})
})
