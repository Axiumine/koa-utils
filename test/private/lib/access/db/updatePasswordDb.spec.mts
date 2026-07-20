/**
 * Tests for private/lib/access/db/updatePasswordDb.mts
 *
 * Default export is a function literally named `updatePassword` (file name and export name differ).
 *
 * Chain: updatePassword(session, _id, password)
 *   → hash(password, SALT_ROUNDS) (real @node-rs/bcrypt call — `hash` is a captured named binding,
 *     not stubbable via sinon, same constraint documented in
 *     test/graphQL/schema/mutations/updatePassword.spec.mts)
 *   → UserBase.updateOne({ _id }, { $set: { 'login.password': hashVal } }, { session, runValidators: true })
 *
 * No branches in this module — a single straight-line path.
 */
import updatePassword from '@private/lib/access/db/updatePasswordDb.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { compareHashAsync } from '@lib/hash.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

// ---------------------------------------------------------------------------

describe('updatePasswordDb (default export: updatePassword)', () => {
	let updateOneStub: sinon.SinonStub

	beforeEach(() => {
		updateOneStub = sinon.stub(UserBase, 'updateOne').resolves({ acknowledged: true, modifiedCount: 1 } as never)
	})

	afterEach(() => {
		sinon.restore()
	})

	it('hashes the password with real bcrypt and updates login.password with session + runValidators', async function () {
		this.timeout(20000)

		const session = { id: 'fake-session' } as never
		const _id = new Types.ObjectId()

		await updatePassword(session, _id, 'newpassword1')

		expect(updateOneStub.calledOnce).to.equal(true)
		const [filter, update, options] = updateOneStub.firstCall.args

		expect(filter).to.deep.equal({ _id })
		expect(options).to.deep.equal({ session, runValidators: true })

		const hashVal = update.$set['login.password']
		expect(hashVal).to.be.a('string').and.not.equal('newpassword1')

		// Prove it is a genuine bcrypt hash of the supplied password, not a stub or passthrough.
		const matches = await compareHashAsync('newpassword1', hashVal)
		expect(matches).to.equal(true)
	})

	it('resolves with the result of UserBase.updateOne', async function () {
		this.timeout(20000)

		const session = {} as never
		const _id = new Types.ObjectId()

		const result = await updatePassword(session, _id, 'anotherpassword2')

		expect(result).to.deep.equal({ acknowledged: true, modifiedCount: 1 })
	})
})
