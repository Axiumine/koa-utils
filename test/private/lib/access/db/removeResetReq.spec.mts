/**
 * Tests for private/lib/access/db/removeResetReq.mts
 *
 * Chain: removeResetReq(session, email)
 *   → UserBase.updateOne({ 'login.email': email }, { $unset: ... }).session(session).exec()
 *
 * Call used to pass { upsert: true } → an `email` matching no document did not no-op: MongoDB inserted a
 * row keyed by login.email, and updateOne skip validators → that row carried none of the schema's required
 * fields. Option gone; tests below pin its absence and the no-op result → it cannot come back unnoticed.
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
			// exposed → callers assert what session passed through the chain
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

	it('calls UserBase.updateOne with a login.email filter and $unset update, and passes no options', async () => {
		updateOneStub = sinon
			.stub(UserBase, 'updateOne')
			.returns(makeSessionExecChain({ acknowledged: true, matchedCount: 1, modifiedCount: 1 }) as never)

		await removeResetReq(fakeSession, 'user@test.com')

		expect(updateOneStub.calledOnce).to.equal(true)
		expect(updateOneStub.firstCall.args[0]).to.deep.equal({ 'login.email': 'user@test.com' })
		expect(updateOneStub.firstCall.args[1]).to.deep.equal({
			$unset: { 'account.resetDateReq': '', 'account.resetHash': '' }
		})
		// No 3rd argument at all. Assert the whole args list, not just args[2] → reintroducing any option object
		// — upsert or otherwise — fail here.
		expect(updateOneStub.firstCall.args).to.have.lengthOf(2)
	})

	it('unsets exactly the paths saveResetReq sets — no orphaned reset hash left behind', async () => {
		// Regression guard, twice over: both paths must stay in lockstep (an unset missing one leaves either a live
		// token or an orphan resetDateReq), and neither may be account.email.hash — clearing the verification slot
		// here killed a concurrent activation or email-change link.
		updateOneStub = sinon
			.stub(UserBase, 'updateOne')
			.returns(makeSessionExecChain({ acknowledged: true, matchedCount: 1, modifiedCount: 1 }) as never)

		await saveResetReq(fakeSession, new Types.ObjectId(), new Date(0), 'the-reset-hash')
		const setPaths = Object.keys(updateOneStub.firstCall.args[1].$set).sort()

		updateOneStub.resetHistory()
		await removeResetReq(fakeSession, 'user@test.com')
		const unsetPaths = Object.keys(updateOneStub.firstCall.args[1].$unset).sort()

		expect(unsetPaths).to.deep.equal(setPaths)
		expect(unsetPaths).to.deep.equal(['account.resetDateReq', 'account.resetHash'])
		expect(unsetPaths.filter((p) => p.startsWith('account.email.'))).to.deep.equal([])
	})

	it('runs the update within the given session and resolves with the exec() result', async () => {
		const execResult = { acknowledged: true, matchedCount: 1, modifiedCount: 1 }
		updateOneStub = sinon.stub(UserBase, 'updateOne').returns(makeSessionExecChain(execResult) as never)

		const result = await removeResetReq(fakeSession, 'user@test.com')

		expect(result).to.deep.equal(execResult)
	})

	it('REGRESSION: a non-matching email no-ops instead of creating a document', async () => {
		// With { upsert: true } this same call answered matchedCount 0 + upsertedCount 1 + upsertedId: MongoDB
		// inserted a row for 'ghost@test.com' carrying nothing but login.email — updateOne run no validators → none
		// of the schema's required fields applied. No option → the write match nothing, nothing created.
		const execResult = {
			acknowledged: true,
			matchedCount: 0,
			modifiedCount: 0,
			upsertedCount: 0,
			upsertedId: null
		}
		updateOneStub = sinon.stub(UserBase, 'updateOne').returns(makeSessionExecChain(execResult) as never)

		const result = await removeResetReq(fakeSession, 'ghost@test.com')

		// Option is what made an insert possible → its absence is the assertion that matter.
		expect(updateOneStub.firstCall.args).to.have.lengthOf(2)
		expect(result).to.deep.equal(execResult)
		expect((result as typeof execResult).matchedCount).to.equal(0)
		expect((result as typeof execResult).upsertedCount).to.equal(0)
		expect((result as typeof execResult).upsertedId).to.equal(null)
	})
})
