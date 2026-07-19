/**
 * Tests for private/lib/access/db/saveResetReq.mts
 *
 * Chain: saveResetReq(session, _id, now, hash) → UserBase.updateOne(...)
 *        catch(e) → throwMongoDBErrors(e) → throwIfMongoErr(e) (409 dup key / 400 validator) or
 *                    Sentry.captureException + throwInternalError() (500)
 */
import { saveResetReq } from '@private/lib/access/db/saveResetReq.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

import { expectGraphQLErrorAsync } from '../../../../helpers/assertGraphQLError.mjs'

// ---------------------------------------------------------------------------

describe('saveResetReq', () => {
	let updateOneStub: sinon.SinonStub

	const session = {} as never
	const _id = new Types.ObjectId()
	const now = new Date()
	const hash = 'somehash123'

	afterEach(() => {
		sinon.restore()
	})

	it('happy path: calls UserBase.updateOne with the expected filter, $set and options', async () => {
		updateOneStub = sinon.stub(UserBase, 'updateOne').resolves({ acknowledged: true, modifiedCount: 1 } as never)

		const result = await saveResetReq(session, _id, now, hash)

		expect(result).to.equal(undefined)
		expect(updateOneStub.calledOnce).to.equal(true)
		expect(updateOneStub.firstCall.args[0]).to.deep.equal({ _id })
		expect(updateOneStub.firstCall.args[1]).to.deep.equal({
			$set: {
				'account.resetDateReq': now,
				'account.email.hash': hash
			}
		})
		expect(updateOneStub.firstCall.args[2]).to.deep.equal({ session, runValidators: true })
	})

	it('duplicate key error → throws 409 Conflict via throwMongoDBErrors', async () => {
		sinon.stub(UserBase, 'updateOne').rejects({ errorResponse: { code: 11000 }, message: 'dup' } as never)

		await expectGraphQLErrorAsync(() => saveResetReq(session, _id, now, hash), 409, 'Conflict')
	})

	it('[Validator] prefixed message → throws 400 Bad Request via throwMongoDBErrors', async () => {
		sinon.stub(UserBase, 'updateOne').rejects({ message: '[Validator] hash too short' } as never)

		await expectGraphQLErrorAsync(() => saveResetReq(session, _id, now, hash), 400, 'Bad Request', 'hash too short')
	})

	it('unrecognized mongo error → throws 500 Internal Server Error via throwMongoDBErrors', async () => {
		sinon.stub(UserBase, 'updateOne').rejects({ message: 'random failure' } as never)

		await expectGraphQLErrorAsync(
			() => saveResetReq(session, _id, now, hash),
			500,
			'Internal Server Error',
			'Error reported to Dev Team.'
		)
	})
})
