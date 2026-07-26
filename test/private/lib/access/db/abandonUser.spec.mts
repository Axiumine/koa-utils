/**
 * Tests for private/lib/access/db/abandonUser.mts
 *
 * What abandonment means is the caller's policy, not the package's. A pending registration at the head of
 * a chain of dependent collections cannot be `deleteOne`d — mongo has no cascade — so `'delete'` (the
 * historical behaviour, still the default), `'soft-delete'` and `'keep'` all have to be reachable, and all
 * three have to share one signature so the guards stay unaware of which one they run.
 */
import { createAbandonUser } from '@private/lib/access/db/abandonUser.mjs'
import { resolveVerifyEmailPaths } from '@lib/access/accessPaths.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

// ---------------------------------------------------------------------------

const PATHS = resolveVerifyEmailPaths({ email: 'mail', deleted: 'flags.deletedAt' })

function makeModel() {
	const updateOne = sinon.stub().resolves({ modifiedCount: 1 })
	const deleteOne = sinon.stub().resolves({ deletedCount: 1 })

	return { updateOne, deleteOne, model: { updateOne, deleteOne } as never }
}

describe('createAbandonUser', () => {
	afterEach(() => sinon.restore())

	describe("mode 'delete'", () => {
		it('removes the row, keyed by the login-email path', async () => {
			const { model, updateOne, deleteOne } = makeModel()
			const abandon = createAbandonUser({ model, paths: PATHS, mode: 'delete' })

			await abandon('gone@test.com')

			expect(deleteOne.calledOnceWithExactly({ mail: 'gone@test.com' })).to.equal(true)
			expect(updateOne.called).to.equal(false)
		})
	})

	describe("mode 'soft-delete'", () => {
		it('sets the deleted path instead of removing the row, defaulting to true', async () => {
			const { model, updateOne, deleteOne } = makeModel()
			const abandon = createAbandonUser({ model, paths: PATHS, mode: 'soft-delete' })

			await abandon('kept@test.com')

			expect(updateOne.calledOnce).to.equal(true)
			expect(updateOne.firstCall.args).to.deep.equal([
				{ mail: 'kept@test.com' },
				{ $set: { 'flags.deletedAt': true } },
				{ runValidators: true }
			])
			expect(deleteOne.called).to.equal(false)
		})

		it('writes a caller-supplied literal, so a non-boolean column is not forced to true', async () => {
			const { model, updateOne } = makeModel()
			const abandon = createAbandonUser({ model, paths: PATHS, mode: 'soft-delete', deletedValue: 'abandoned' })

			await abandon('kept@test.com')

			expect(updateOne.firstCall.args[1]).to.deep.equal({ $set: { 'flags.deletedAt': 'abandoned' } })
		})

		it('calls a factory once per write, so a timestamp column gets the time of its own write', async () => {
			const { model, updateOne } = makeModel()
			const stamps = [new Date('2026-01-01T00:00:00.000Z'), new Date('2026-02-02T00:00:00.000Z')]
			const factory = sinon.stub()
			factory.onFirstCall().returns(stamps[0])
			factory.onSecondCall().returns(stamps[1])
			const abandon = createAbandonUser({ model, paths: PATHS, mode: 'soft-delete', deletedValue: factory })

			await abandon('first@test.com')
			await abandon('second@test.com')

			expect(factory.calledTwice).to.equal(true)
			expect(updateOne.firstCall.args[1]).to.deep.equal({ $set: { 'flags.deletedAt': stamps[0] } })
			expect(updateOne.secondCall.args[1]).to.deep.equal({ $set: { 'flags.deletedAt': stamps[1] } })
		})

		it('unsets nothing — the tombstone is the whole write', async () => {
			const { model, updateOne } = makeModel()
			const abandon = createAbandonUser({ model, paths: PATHS, mode: 'soft-delete' })

			await abandon('kept@test.com')

			// Deriving an $unset list from the leaf paths would break any layout storing the verification
			// state as one required-members subdocument. That list is verifyClear's job, and its caller's.
			expect(Object.keys(updateOne.firstCall.args[1])).to.deep.equal(['$set'])
		})
	})

	describe("mode 'keep'", () => {
		it('never touches the model', async () => {
			const { model, updateOne, deleteOne } = makeModel()
			const abandon = createAbandonUser({ model, paths: PATHS, mode: 'keep' })

			const result = await abandon('kept@test.com')

			expect(result).to.equal(undefined)
			expect(deleteOne.called).to.equal(false)
			expect(updateOne.called).to.equal(false)
		})
	})
})
