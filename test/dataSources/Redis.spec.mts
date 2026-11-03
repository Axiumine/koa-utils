import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect } from 'chai'
import sinon from 'sinon'

import { probeSentry } from '../helpers/sentryProbe.mjs'

// Sentry.captureException non-stubbable in ESM.
// Stub instance methods on redisClient (mutable object properties).
// Sentry observed via probeSentry (recording client). Module-load code (env wiring, cluster arm,
// dotenv) re-run through a cache-busting query on the dist import → no connect, no socket opens.

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

	describe('console + Sentry reporting', () => {
		it('RedisConnect logs the attempt and the success, in order, around connect()', async () => {
			const { redisClient, RedisConnect } = await import('../../dist/dataSources/Redis.mjs')
			const info = sinon.stub(console, 'info')
			// deliberate: connect() result unread by RedisConnect → fake returns void, cast past client type
			sinon.stub(redisClient, 'connect').callsFake((async () => {
				// attempt line must already be out when connect() runs
				expect(info.callCount).to.equal(1)
			}) as never)

			await RedisConnect()

			expect(info.args).to.deep.equal([
				['[Redis] Try connect to database... '],
				['[Redis] OK: Redis connection has been established successfully. ']
			])
		})

		it('error event logs "Redis Client Error" and reports the error to Sentry', async () => {
			const { redisClient, RedisConnect } = await import('../../dist/dataSources/Redis.mjs')
			sinon.stub(console, 'info')
			const error = sinon.stub(console, 'error')
			sinon.stub(redisClient, 'connect').resolves()
			redisClient.removeAllListeners('error')
			await RedisConnect()

			const events = await probeSentry(async () => {
				redisClient.emit('error', new Error('redis down'))
			})

			expect(error.args).to.deep.equal([['Redis Client Error']])
			expect(events).to.deep.equal([{ message: undefined, level: 'error', exceptionMessage: 'redis down' }])
			redisClient.removeAllListeners('error')
		})

		it('RedisDisconnect logs the attempt and the success around close()', async () => {
			const { redisClient, RedisDisconnect } = await import('../../dist/dataSources/Redis.mjs')
			const info = sinon.stub(console, 'info')
			sinon.stub(redisClient, 'close').callsFake(async () => {
				expect(info.callCount).to.equal(1)
			})

			await RedisDisconnect()

			expect(info.args).to.deep.equal([
				['[Redis] Try close connection to database... '],
				['[Redis] OK: Redis connection has been closed successfully.']
			])
		})

		it('RedisDisconnect on an already closed client logs it, reports nothing, resolves', async () => {
			const { redisClient, RedisDisconnect } = await import('../../dist/dataSources/Redis.mjs')
			const info = sinon.stub(console, 'info')
			const error = sinon.stub(console, 'error')
			sinon.stub(redisClient, 'close').rejects(new Error('The client is closed'))

			const events = await probeSentry(() => RedisDisconnect())

			expect(info.args).to.deep.equal([['[Redis] Try close connection to database... '], ['[Redis] Client was already closed']])
			expect(error.called).to.equal(false)
			expect(events).to.deep.equal([])
		})

		it('RedisDisconnect on another error logs it, reports it to Sentry and re-throws it', async () => {
			const { redisClient, RedisDisconnect } = await import('../../dist/dataSources/Redis.mjs')
			sinon.stub(console, 'info')
			const error = sinon.stub(console, 'error')
			const failure = new Error('network failure')
			sinon.stub(redisClient, 'close').rejects(failure)
			let caught: unknown

			const events = await probeSentry(async () => {
				try {
					await RedisDisconnect()
				} catch (e) {
					caught = e
				}
			})

			expect(caught).to.equal(failure)
			expect(error.args).to.deep.equal([['[Redis] Error during disconnection']])
			expect(events).to.deep.equal([{ message: undefined, level: 'error', exceptionMessage: 'network failure' }])
		})

		it('RedisDisconnect treats a non-Error rejection as "other": logged and re-thrown', async () => {
			const { redisClient, RedisDisconnect } = await import('../../dist/dataSources/Redis.mjs')
			sinon.stub(console, 'info')
			const error = sinon.stub(console, 'error')
			const failure = { message: 'The client is closed' }
			sinon.stub(redisClient, 'close').rejects(failure as never)
			let caught: unknown

			try {
				await RedisDisconnect()
			} catch (e) {
				caught = e
			}

			// duck-typed look-alike must not be swallowed: instanceof Error guard
			expect(caught).to.equal(failure)
			expect(error.args).to.deep.equal([['[Redis] Error during disconnection']])
		})
	})

	describe('module load wiring', () => {
		const KEYS = [
			'REDIS_IS_CLUSTER',
			'REDIS_URL',
			'REDIS_TLS',
			'REDIS_DB1_HOST',
			'REDIS_DB1_PORT',
			'REDIS_DB2_HOST',
			'REDIS_DB2_PORT',
			'REDIS_DB3_HOST',
			'REDIS_DB3_PORT',
			'REDIS_USERNAME',
			'REDIS_PASSWORD'
		]
		let saved: Record<string, string | undefined>
		let seq = 0

		beforeEach(() => {
			saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
			for (const k of KEYS) delete process.env[k]
		})

		afterEach(() => {
			for (const k of KEYS) {
				if (saved[k] === undefined) delete process.env[k]
				else process.env[k] = saved[k]
			}
		})

		/** Fresh evaluation of dist Redis.mjs; query string defeats the ESM cache. */
		const loadFresh = async () => {
			seq += 1
			return import(`../../dist/dataSources/Redis.mjs?s4fresh=${seq}`)
		}

		// node-redis keep the constructor options on `options` (client) / `_options` (cluster)
		type TClientLike = { options?: { url?: string }; _options?: { rootNodes: unknown; defaults: unknown } }

		const setClusterNodes = () => {
			process.env['REDIS_IS_CLUSTER'] = '1'
			process.env['REDIS_DB1_HOST'] = 'node-a.test'
			process.env['REDIS_DB1_PORT'] = '7001'
			process.env['REDIS_DB2_HOST'] = 'node-b.test'
			process.env['REDIS_DB2_PORT'] = '7002'
			process.env['REDIS_DB3_HOST'] = 'node-c.test'
			process.env['REDIS_DB3_PORT'] = '7003'
		}

		it('without REDIS_IS_CLUSTER it builds a single-node client on REDIS_URL', async () => {
			process.env['REDIS_URL'] = 'redis://single-node.test:6380'

			const { redisClient } = (await loadFresh()) as { redisClient: TClientLike }

			expect(redisClient.options?.url).to.equal('redis://single-node.test:6380')
			expect(redisClient._options).to.equal(undefined)
		})

		it('REDIS_IS_CLUSTER other than "1" keeps the single-node client', async () => {
			process.env['REDIS_URL'] = 'redis://single-node.test:6380'
			process.env['REDIS_IS_CLUSTER'] = 'true'

			const { redisClient } = (await loadFresh()) as { redisClient: TClientLike }

			expect(redisClient.options?.url).to.equal('redis://single-node.test:6380')
			expect(redisClient._options).to.equal(undefined)
		})

		it('REDIS_IS_CLUSTER=1 builds a cluster over the three DB nodes with credentials and plaintext sockets', async () => {
			setClusterNodes()
			process.env['REDIS_USERNAME'] = 'cluster-user'
			process.env['REDIS_PASSWORD'] = 'cluster-pass'

			const { redisClient } = (await loadFresh()) as { redisClient: TClientLike }

			expect(redisClient.options).to.equal(undefined)
			expect(redisClient._options?.rootNodes).to.deep.equal([
				{ url: 'redis://node-a.test:7001' },
				{ url: 'redis://node-b.test:7002' },
				{ url: 'redis://node-c.test:7003' }
			])
			expect(redisClient._options?.defaults).to.deep.equal({
				username: 'cluster-user',
				password: 'cluster-pass',
				socket: { tls: false }
			})
		})

		it('REDIS_IS_CLUSTER=1 with REDIS_TLS=true uses rediss:// roots and TLS sockets', async () => {
			setClusterNodes()
			process.env['REDIS_TLS'] = 'true'

			const { redisClient } = (await loadFresh()) as { redisClient: TClientLike }

			expect(redisClient._options?.rootNodes).to.deep.equal([
				{ url: 'rediss://node-a.test:7001' },
				{ url: 'rediss://node-b.test:7002' },
				{ url: 'rediss://node-c.test:7003' }
			])
			expect((redisClient._options?.defaults as { socket: unknown }).socket).to.deep.equal({ tls: true })
		})

		it('loads the dotenv file of the working directory at import', async () => {
			const probe = 'S4_REDIS_DOTENV_PROBE'
			const dir = mkdtempSync(join(tmpdir(), 'koa-utils-redis-dotenv-'))
			const cwd = process.cwd()
			writeFileSync(join(dir, '.env'), `${probe}=loaded-from-dotenv\n`)
			delete process.env[probe]
			sinon.stub(console, 'log') // dotenv prints an "injecting env" tip

			try {
				process.chdir(dir)
				await loadFresh()
				expect(process.env[probe]).to.equal('loaded-from-dotenv')
			} finally {
				process.chdir(cwd)
				delete process.env[probe]
				rmSync(dir, { recursive: true, force: true })
			}
		})
	})
})
