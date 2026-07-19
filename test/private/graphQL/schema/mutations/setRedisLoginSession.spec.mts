/**
 * Tests for private/graphQL/schema/mutations/setRedisLoginSession.mts
 *
 * Chain: setRedisLoginSession → redisClient.hSet / redisClient.expire / redisClient.del
 *        on failure: Sentry.captureException → throwInternalError → throwGraphQLError
 */
import { setRedisLoginSession } from '@private/graphQL/schema/mutations/setRedisLoginSession.mjs'
import { redisClient } from '@dataSources/Redis.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

import { expectGraphQLErrorAsync } from '../../../../helpers/assertGraphQLError.mjs'

// NOTE: Sentry.captureException cannot be stubbed (ESM non-writable export).
// Without init, it is a no-op, so we only assert the observable rethrow + Redis cleanup.

// ---------------------------------------------------------------------------

describe('setRedisLoginSession', () => {
	let hSetStub: sinon.SinonStub
	let expireStub: sinon.SinonStub
	let delStub: sinon.SinonStub

	afterEach(() => {
		sinon.restore()
	})

	it('happy path: stores access + refresh keys and sets their expiry', async () => {
		hSetStub = sinon.stub(redisClient, 'hSet').resolves(1)
		expireStub = sinon.stub(redisClient, 'expire').resolves(true)
		delStub = sinon.stub(redisClient, 'del').resolves(0)

		const id = new Types.ObjectId()
		const accessToken = 'access-uuid'
		const refreshToken = 'refresh-uuid'
		const accTokenExp = 3600

		await setRedisLoginSession(id, accessToken, accTokenExp, refreshToken)

		expect(hSetStub.calledTwice).to.equal(true)
		expect(hSetStub.firstCall.args[0]).to.include(`access:${accessToken}`)
		expect(hSetStub.firstCall.args[1]).to.deep.equal({ id: id.toString() })
		expect(hSetStub.secondCall.args[0]).to.include(`refresh:${refreshToken}`)
		expect(hSetStub.secondCall.args[1]).to.deep.equal({ id: id.toString(), access: accessToken })

		expect(expireStub.calledTwice).to.equal(true)
		expect(expireStub.firstCall.args).to.deep.equal([hSetStub.firstCall.args[0], accTokenExp])
		expect(expireStub.secondCall.args[0]).to.equal(hSetStub.secondCall.args[0])
		expect(expireStub.secondCall.args[1]).to.equal(90 * 24 * 60 * 60)

		expect(delStub.called).to.equal(false)
	})

	it('hSet rejection: deletes both keys and throws 500 Internal Server Error', async () => {
		const boom = new Error('redis down')
		hSetStub = sinon.stub(redisClient, 'hSet').rejects(boom)
		expireStub = sinon.stub(redisClient, 'expire').resolves(true)
		delStub = sinon.stub(redisClient, 'del').resolves(1)

		const id = new Types.ObjectId()

		const err = await expectGraphQLErrorAsync(
			() => setRedisLoginSession(id, 'access-uuid', 3600, 'refresh-uuid'),
			500,
			'Internal Server Error'
		)

		expect((err.extensions as { description?: string }).description).to.equal('Error reported to Dev Team.')
		expect(delStub.calledTwice).to.equal(true)
		expect(delStub.firstCall.args[0]).to.include('access:access-uuid')
		expect(delStub.secondCall.args[0]).to.include('refresh:refresh-uuid')
		expect(expireStub.called).to.equal(false)
	})

	it('expire rejection: deletes both keys and throws 500 Internal Server Error', async () => {
		const boom = new Error('expire failed')
		hSetStub = sinon.stub(redisClient, 'hSet').resolves(1)
		expireStub = sinon.stub(redisClient, 'expire').rejects(boom)
		delStub = sinon.stub(redisClient, 'del').resolves(1)

		const id = new Types.ObjectId()

		await expectGraphQLErrorAsync(
			() => setRedisLoginSession(id, 'access-uuid2', 1800, 'refresh-uuid2'),
			500,
			'Internal Server Error'
		)

		expect(hSetStub.calledTwice).to.equal(true)
		expect(delStub.calledTwice).to.equal(true)
	})
})
