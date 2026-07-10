import { expect } from 'chai'
import sinon from 'sinon'

// Sentry.captureException is non-stubbable in ESM.
// We stub instance methods on redisClient (mutable object properties).

describe('Redis', () => {
	afterEach(() => {
		sinon.restore()
	})

	it('redisClient is exported', async () => {
		const { redisClient } = await import('../../dist/dataSources/Redis.mjs')
		expect(redisClient).to.exist
	})

	it('RedisConnect attaches error listener and calls connect()', async () => {
		const { redisClient, RedisConnect } = await import('../../dist/dataSources/Redis.mjs')
		const connectStub = sinon.stub(redisClient, 'connect').resolves()
		await RedisConnect()
		expect(connectStub.calledOnce).to.equal(true)
	})

	it('error event fires without throwing (Sentry is a no-op without init)', async () => {
		const { redisClient, RedisConnect } = await import('../../dist/dataSources/Redis.mjs')
		sinon.stub(redisClient, 'connect').resolves()
		await RedisConnect()
		const err = new Error('redis error')
		redisClient.emit('error', err)
	})

	it('RedisDisconnect calls close() on success', async () => {
		const { redisClient, RedisDisconnect } = await import('../../dist/dataSources/Redis.mjs')
		const closeStub = sinon.stub(redisClient, 'close').resolves()
		await RedisDisconnect()
		expect(closeStub.calledOnce).to.equal(true)
	})

	it('RedisDisconnect swallows "The client is closed" error', async () => {
		const { redisClient, RedisDisconnect } = await import('../../dist/dataSources/Redis.mjs')
		const closed = new Error('The client is closed')
		sinon.stub(redisClient, 'close').rejects(closed)
		// should not throw
		await RedisDisconnect()
	})

	it('RedisDisconnect re-throws other errors', async () => {
		const { redisClient, RedisDisconnect } = await import('../../dist/dataSources/Redis.mjs')
		const err = new Error('network failure')
		sinon.stub(redisClient, 'close').rejects(err)
		let caught: unknown
		try {
			await RedisDisconnect()
		} catch (e) {
			caught = e
		}
		expect(caught).to.equal(err)
	})

	it('RedisDisconnect re-throws non-Error values', async () => {
		const { redisClient, RedisDisconnect } = await import('../../dist/dataSources/Redis.mjs')
		const nonErr = { code: 'CUSTOM' }
		sinon.stub(redisClient, 'close').rejects(nonErr as never)
		let caught: unknown
		try {
			await RedisDisconnect()
		} catch (e) {
			caught = e
		}
		expect(caught).to.exist
	})
})
