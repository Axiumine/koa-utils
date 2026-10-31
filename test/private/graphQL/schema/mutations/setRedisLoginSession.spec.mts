/**
 * Tests for private/graphQL/schema/mutations/setRedisLoginSession.mts
 *
 * Chain: setRedisLoginSession → redisClient.hSet / redisClient.expire / redisClient.del
 * fail → Sentry.captureException → throwInternalError → throwGraphQLError
 */
import { setRedisLoginSession } from '@private/graphQL/schema/mutations/setRedisLoginSession.mjs'
import { redisClient } from '@dataSources/Redis.mjs'
import * as Sentry from '@sentry/node'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

import { expectGraphQLErrorAsync } from '../../../../helpers/assertGraphQLError.mjs'

// NOTE: Sentry.captureException not stubbable (ESM non-writable export). No init → no-op → assert the
// observable rethrow + Redis cleanup only.

// ---------------------------------------------------------------------------

// Sentry export sealed → not stubbable. Observe via fake client on current scope: Sentry.captureX → scope → client.captureX.
function spyOnSentry() {
	const captureException = sinon.stub()
	const scope = Sentry.getCurrentScope()
	const previous = scope.getClient()
	scope.setClient({ captureException } as never)
	return { captureException, restore: () => scope.setClient(previous as never) }
}

describe('setRedisLoginSession', () => {
	let hSetStub: sinon.SinonStub
	let expireStub: sinon.SinonStub
	let delStub: sinon.SinonStub

	const savedRedisKey = process.env['REDIS_KEY']

	afterEach(() => {
		sinon.restore()
		if (savedRedisKey === undefined) delete process.env['REDIS_KEY']
		else process.env['REDIS_KEY'] = savedRedisKey
	})

	it('happy path: stores access + refresh keys and sets their expiry', async () => {
		hSetStub = sinon.stub(redisClient, 'hSet').resolves(1)
		expireStub = sinon.stub(redisClient, 'expire').resolves(1)
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
		expireStub = sinon.stub(redisClient, 'expire').resolves(1)
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

	it('keys are exact: <REDIS_KEY>access:<token> and <REDIS_KEY>refresh:<token>', async () => {
		// REDIS_KEY set to a known value → mutant reading another env name yields "undefined" prefix, caught.
		process.env['REDIS_KEY'] = 's6-prefix:'
		const prefix = 's6-prefix:'
		const hSet = sinon.stub(redisClient, 'hSet').resolves(1)
		const expire = sinon.stub(redisClient, 'expire').resolves(1)

		await setRedisLoginSession(new Types.ObjectId(), 'acc-1', 60, 'ref-1')

		expect(hSet.firstCall.args[0]).to.equal(`${prefix}access:acc-1`)
		expect(hSet.secondCall.args[0]).to.equal(`${prefix}refresh:ref-1`)
		expect(expire.firstCall.args[0]).to.equal(`${prefix}access:acc-1`)
		expect(expire.secondCall.args[0]).to.equal(`${prefix}refresh:ref-1`)
	})

	it('failure: del gets the exact keys and Sentry gets the original error, once', async () => {
		process.env['REDIS_KEY'] = 's6-prefix:'
		const prefix = 's6-prefix:'
		const boom = new Error('redis down')
		sinon.stub(redisClient, 'hSet').rejects(boom)
		sinon.stub(redisClient, 'expire').resolves(1)
		const del = sinon.stub(redisClient, 'del').resolves(1)
		const sentry = spyOnSentry()
		try {
			await expectGraphQLErrorAsync(
				() => setRedisLoginSession(new Types.ObjectId(), 'acc-2', 60, 'ref-2'),
				500,
				'Internal Server Error'
			)

			expect(del.firstCall.args[0]).to.equal(`${prefix}access:acc-2`)
			expect(del.secondCall.args[0]).to.equal(`${prefix}refresh:ref-2`)
			expect(sentry.captureException.calledOnce).to.equal(true)
			expect(sentry.captureException.firstCall.args[0]).to.equal(boom)
		} finally {
			sentry.restore()
		}
	})

	it('success: nothing reported to Sentry', async () => {
		sinon.stub(redisClient, 'hSet').resolves(1)
		sinon.stub(redisClient, 'expire').resolves(1)
		const sentry = spyOnSentry()
		try {
			await setRedisLoginSession(new Types.ObjectId(), 'acc-3', 60, 'ref-3')

			expect(sentry.captureException.called).to.equal(false)
		} finally {
			sentry.restore()
		}
	})
})
