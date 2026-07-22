/**
 * Tests for private/lib/access/db/removeResetReq.mts
 *
 * Chain: removeResetReq(session, email)
 *   → UserBase.updateOne({ 'login.email': email }, { $unset: ... }, { upsert: true }).session(session).exec()
 *
 * FOOTGUN: the call passes { upsert: true }. When `email` matches no document, MongoDB does not
 * no-op — it CREATES a new document containing only the $unset target paths implicitly initialised
 * (i.e. an otherwise-empty user row keyed by login.email). This is pinned explicitly below: the
 * options object always carries upsert:true, and the resolved write result surfaces upsertedId/
 * upsertedCount even when matchedCount is 0, proving a document was created rather than skipped.
 */
import removeResetReq from '@private/lib/access/db/removeResetReq.mjs'
import { saveResetReq } from '@private/lib/access/db/saveResetReq.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

// ---------------------------------------------------------------------------

/** Chain for UserBase.updateOne(...).session(...).exec() */
function makeSessionExecChain(execResult: unknown) {
	return {
		session: (s: unknown) => ({
			exec: () => Promise.resolve(execResult),
			// exposed so callers can assert what session was passed through the chain
			__session: s
		})
	}
}

// ---------------------------------------------------------------------------

describe('removeResetReq', () => {
	let updateOneStub: sinon.SinonStub
	const fakeSession = { id: 'fake-session' } as never

	afterEach(() => {
		sinon.restore()
	})

	it('calls UserBase.updateOne with a login.email filter, $unset update, and upsert:true option', async () => {
		updateOneStub = sinon
			.stub(UserBase, 'updateOne')
			.returns(makeSessionExecChain({ acknowledged: true, matchedCount: 1, modifiedCount: 1 }) as never)

		await removeResetReq(fakeSession, 'user@test.com')

		expect(updateOneStub.calledOnce).to.equal(true)
		expect(updateOneStub.firstCall.args[0]).to.deep.equal({ 'login.email': 'user@test.com' })
		expect(updateOneStub.firstCall.args[1]).to.deep.equal({
			$unset: { 'account.resetDateReq': '', 'account.email.hash': '' }
		})
		expect(updateOneStub.firstCall.args[2]).to.deep.equal({ upsert: true })
	})

	it('unsets exactly the paths saveResetReq sets — no orphaned reset hash left behind', async () => {
		// Regression guard: removeResetReq used to unset 'account.resetHash', a path that exists in
		// neither UserBaseSchema nor saveResetReq, so the reset hash survived in account.email.hash.
		updateOneStub = sinon
			.stub(UserBase, 'updateOne')
			.returns(makeSessionExecChain({ acknowledged: true, matchedCount: 1, modifiedCount: 1 }) as never)

		await saveResetReq(fakeSession, new Types.ObjectId(), new Date(0), 'the-reset-hash')
		const setPaths = Object.keys(updateOneStub.firstCall.args[1].$set).sort()

		updateOneStub.resetHistory()
		await removeResetReq(fakeSession, 'user@test.com')
		const unsetPaths = Object.keys(updateOneStub.firstCall.args[1].$unset).sort()

		expect(unsetPaths).to.deep.equal(setPaths)
		expect(unsetPaths).to.deep.equal(['account.email.hash', 'account.resetDateReq'])
	})

	it('runs the update within the given session and resolves with the exec() result', async () => {
		const execResult = { acknowledged: true, matchedCount: 1, modifiedCount: 1 }
		updateOneStub = sinon.stub(UserBase, 'updateOne').returns(makeSessionExecChain(execResult) as never)

		const result = await removeResetReq(fakeSession, 'user@test.com')

		expect(result).to.deep.equal(execResult)
	})

	it('FOOTGUN: a non-matching email creates a new document instead of no-oping (upsert:true)', async () => {
		const upsertedId = new Types.ObjectId()
		// Real MongoDB behaviour being pinned: matchedCount 0 + upsertedCount 1 means a brand-new
		// document was inserted for 'login.email': 'ghost@test.com', not that nothing happened.
		const execResult = {
			acknowledged: true,
			matchedCount: 0,
			modifiedCount: 0,
			upsertedCount: 1,
			upsertedId
		}
		updateOneStub = sinon.stub(UserBase, 'updateOne').returns(makeSessionExecChain(execResult) as never)

		const result = await removeResetReq(fakeSession, 'ghost@test.com')

		// The options object is what makes this possible — assert it is still upsert:true even
		// for an email that does not exist in the collection.
		expect(updateOneStub.firstCall.args[2]).to.deep.equal({ upsert: true })
		expect(result).to.deep.equal(execResult)
		expect((result as typeof execResult).matchedCount).to.equal(0)
		expect((result as typeof execResult).upsertedCount).to.equal(1)
		expect((result as typeof execResult).upsertedId).to.equal(upsertedId)
	})
})
