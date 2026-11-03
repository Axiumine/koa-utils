import { expect } from 'chai'
import sinon from 'sinon'

import { dotenvConfigRanOnFreshImport } from '../helpers/dotenvProbe.mjs'
import { startSentryCapture } from '../helpers/sentryEventCapture.mjs'

// Sentry.captureException non-stubbable in ESM (non-configurable live binding).
// Stub instance methods on pgClient/pgPool (mutable object properties).

describe('PostgreSQL', () => {
	afterEach(() => {
		sinon.restore()
	})

	it('pgPool and pgClient are exported instances', async () => {
		const { pgPool, pgClient } = await import('../../dist/dataSources/PostgreSQL.mjs')
		expect(pgPool).to.exist
		expect(pgClient).to.exist
	})

	it('PostgreSQLClientConnect succeeds and attaches listeners', async () => {
		const { pgClient, PostgreSQLClientConnect } = await import('../../dist/dataSources/PostgreSQL.mjs')
		const connectStub = sinon.stub(pgClient, 'connect').resolves()
		// reset listeners → attach fresh
		pgClient.removeAllListeners('error')
		pgClient.removeAllListeners('notification')
		pgClient.removeAllListeners('notice')
		await PostgreSQLClientConnect()
		expect(connectStub.calledOnce).to.equal(true)
		expect(pgClient.listenerCount('error')).to.be.greaterThan(0)
		expect(pgClient.listenerCount('notification')).to.be.greaterThan(0)
		expect(pgClient.listenerCount('notice')).to.be.greaterThan(0)
	})

	it('PostgreSQLClientConnect does not add duplicate listeners on second call', async () => {
		const { pgClient, PostgreSQLClientConnect } = await import('../../dist/dataSources/PostgreSQL.mjs')
		sinon.stub(pgClient, 'connect').resolves()
		const countBefore = pgClient.listenerCount('error')
		await PostgreSQLClientConnect()
		expect(pgClient.listenerCount('error')).to.equal(countBefore)
	})

	it('PostgreSQLClientConnect throws on connect failure', async () => {
		const { pgClient, PostgreSQLClientConnect } = await import('../../dist/dataSources/PostgreSQL.mjs')
		sinon.stub(pgClient, 'connect').rejects(new Error('fail'))
		let caught: unknown
		try {
			await PostgreSQLClientConnect()
		} catch (e) {
			caught = e
		}
		expect(caught).to.deep.include({ shutdown: true })
	})

	it('error listener fires without throwing', async () => {
		const { pgClient, PostgreSQLClientConnect } = await import('../../dist/dataSources/PostgreSQL.mjs')
		pgClient.removeAllListeners('error')
		sinon.stub(pgClient, 'connect').resolves()
		await PostgreSQLClientConnect()
		// Sentry.captureException non-stubbable → verify no throw
		const err = new Error('pg error')
		pgClient.emit('error', err)
	})

	it('notification listener fires without throwing', async () => {
		const { pgClient, PostgreSQLClientConnect } = await import('../../dist/dataSources/PostgreSQL.mjs')
		pgClient.removeAllListeners('notification')
		sinon.stub(pgClient, 'connect').resolves()
		await PostgreSQLClientConnect()
		pgClient.emit('notification', { channel: 'test', payload: 'data' })
	})

	it('notice listener fires without throwing', async () => {
		const { pgClient, PostgreSQLClientConnect } = await import('../../dist/dataSources/PostgreSQL.mjs')
		pgClient.removeAllListeners('notice')
		sinon.stub(pgClient, 'connect').resolves()
		await PostgreSQLClientConnect()
		pgClient.emit('notice', 'some notice')
	})

	it('PostgreSQLClientDisconnect resolves on success', async () => {
		const { pgClient, PostgreSQLClientDisconnect } = await import('../../dist/dataSources/PostgreSQL.mjs')
		const endStub = sinon.stub(pgClient, 'end').resolves()
		await PostgreSQLClientDisconnect()
		expect(endStub.calledOnce).to.equal(true)
	})

	it('PostgreSQLClientDisconnect throws on failure', async () => {
		const { pgClient, PostgreSQLClientDisconnect } = await import('../../dist/dataSources/PostgreSQL.mjs')
		sinon.stub(pgClient, 'end').rejects(new Error('end fail'))
		let caught: unknown
		try {
			await PostgreSQLClientDisconnect()
		} catch (e) {
			caught = e
		}
		expect(caught).to.deep.include({ shutdown: true })
	})

	it('PostgreSQLPoolDisconnect resolves on success', async () => {
		const { pgPool, PostgreSQLPoolDisconnect } = await import('../../dist/dataSources/PostgreSQL.mjs')
		const endStub = sinon.stub(pgPool, 'end').resolves()
		await PostgreSQLPoolDisconnect()
		expect(endStub.calledOnce).to.equal(true)
	})

	it('PostgreSQLPoolDisconnect throws on failure', async () => {
		const { pgPool, PostgreSQLPoolDisconnect } = await import('../../dist/dataSources/PostgreSQL.mjs')
		sinon.stub(pgPool, 'end').rejects(new Error('pool end fail'))
		let caught: unknown
		try {
			await PostgreSQLPoolDisconnect()
		} catch (e) {
			caught = e
		}
		expect(caught).to.deep.include({ shutdown: true })
	})

	describe('mutation guards', () => {
		const ENV_KEYS = [
			'POSTGRESQL_USER',
			'POSTGRESQL_PWD',
			'POSTGRESQL_HOST',
			'POSTGRESQL_PORT',
			'POSTGRESQL_DBNAME',
			'POSTGRESQL_POOL_MAX',
			'POSTGRESQL_IDLE_TIMEOUT'
		] as const
		const url = new URL('../../dist/dataSources/PostgreSQL.mjs', import.meta.url).href
		let seq = 0
		let savedEnv: Record<string, string | undefined>

		beforeEach(() => {
			savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
		})

		afterEach(() => {
			for (const k of ENV_KEYS) {
				if (savedEnv[k] === undefined) delete process.env[k]
				else process.env[k] = savedEnv[k]
			}
		})

		// pgClient with no listeners, connect stubbed → fresh listener attach
		const connectFresh = async () => {
			const { pgClient, PostgreSQLClientConnect } = await import('../../dist/dataSources/PostgreSQL.mjs')
			pgClient.removeAllListeners('error')
			pgClient.removeAllListeners('notification')
			pgClient.removeAllListeners('notice')
			sinon.stub(pgClient, 'connect').resolves()
			return { pgClient, PostgreSQLClientConnect }
		}

		it('builds pgClient and pgPool from the POSTGRESQL_* env vars', async () => {
			process.env['POSTGRESQL_USER'] = 'probe_user'
			process.env['POSTGRESQL_PWD'] = 'probe_pwd'
			process.env['POSTGRESQL_HOST'] = 'probe.host.invalid'
			process.env['POSTGRESQL_PORT'] = '5499'
			process.env['POSTGRESQL_DBNAME'] = 'probe_db'
			process.env['POSTGRESQL_POOL_MAX'] = '7'
			process.env['POSTGRESQL_IDLE_TIMEOUT'] = '1234'
			const fresh = (await import(`${url}?cfg=${++seq}`)) as typeof import('../../dist/dataSources/PostgreSQL.mjs')

			expect(fresh.pgClient.user).to.equal('probe_user')
			expect(fresh.pgClient.password).to.equal('probe_pwd')
			expect(fresh.pgClient.host).to.equal('probe.host.invalid')
			expect(fresh.pgClient.port).to.equal(5499)
			expect(fresh.pgClient.database).to.equal('probe_db')

			const opts = (fresh.pgPool as unknown as { options: Record<string, unknown> }).options
			expect(opts).to.include({
				user: 'probe_user',
				password: 'probe_pwd',
				host: 'probe.host.invalid',
				port: 5499,
				database: 'probe_db',
				max: 7,
				idleTimeoutMillis: 1234
			})
		})

		it('loads the dotenv file when the module is evaluated', async () => {
			expect(await dotenvConfigRanOnFreshImport(url)).to.equal(true)
		})

		it('pool idle-client error logs it then exits the process with -1', async () => {
			const { pgPool } = await import('../../dist/dataSources/PostgreSQL.mjs')
			const errorLog = sinon.stub(console, 'error')
			const exit = sinon.stub(process, 'exit')
			const err = new Error('idle boom')
			pgPool.emit('error', err)
			expect(errorLog.calledOnceWithExactly('Unexpected error on idle client', err)).to.equal(true)
			expect(exit.calledOnceWithExactly(-1)).to.equal(true)
		})

		it('connect logs progress and success messages', async () => {
			const { PostgreSQLClientConnect } = await connectFresh()
			const info = sinon.stub(console, 'info')
			await PostgreSQLClientConnect()
			expect(info.getCalls().map((c) => c.args)).to.deep.equal([
				['[PostgreSQL Client] Try connect to database... '],
				['[PostgreSQL Client] OK: PostgreSQL connection has been established successfully.']
			])
		})

		it('connect failure throws the prefixed message with shutdown flag', async () => {
			const { pgClient, PostgreSQLClientConnect } = await import('../../dist/dataSources/PostgreSQL.mjs')
			sinon.stub(console, 'info')
			sinon.stub(pgClient, 'connect').rejects(new Error('fail'))
			let caught: unknown
			try {
				await PostgreSQLClientConnect()
			} catch (e) {
				caught = e
			}
			expect(caught).to.deep.equal({
				message: '[PostgreSQL Client] FAIL: Unable to connect to the database: Error: fail',
				shutdown: true
			})
		})

		it('calling connect twice attaches each of error, notification, notice once', async () => {
			const { pgClient, PostgreSQLClientConnect } = await connectFresh()
			sinon.stub(console, 'info')
			await PostgreSQLClientConnect()
			await PostgreSQLClientConnect()
			expect(pgClient.listenerCount('error')).to.equal(1)
			expect(pgClient.listenerCount('notification')).to.equal(1)
			expect(pgClient.listenerCount('notice')).to.equal(1)
		})

		it('error listener logs the fixed message and reports the error to Sentry with detail', async () => {
			const { pgClient, PostgreSQLClientConnect } = await connectFresh()
			sinon.stub(console, 'info')
			await PostgreSQLClientConnect()
			const errorLog = sinon.stub(console, 'error')
			const capture = startSentryCapture()
			try {
				pgClient.emit('error', new Error('pg error'))
			} finally {
				await capture.stop()
			}
			expect(errorLog.calledOnceWithExactly('[PostgreSQL Client] something bad has happened!')).to.equal(true)
			expect(capture.events).to.have.length(1)
			expect(capture.events[0]?.exception?.values?.[0]).to.deep.include({ type: 'Error', value: 'pg error' })
			expect(capture.events[0]?.extra).to.deep.include({ detail: '[PostgreSQL Client] something bad has happened!' })
		})

		it('notification listener logs channel and payload and reports a warning with extra', async () => {
			const { pgClient, PostgreSQLClientConnect } = await connectFresh()
			const info = sinon.stub(console, 'info')
			await PostgreSQLClientConnect()
			info.resetHistory()
			const capture = startSentryCapture()
			try {
				pgClient.emit('notification', { channel: 'chan1', payload: 'pay1' })
			} finally {
				await capture.stop()
			}
			expect(info.getCalls().map((c) => c.args)).to.deep.equal([
				['[PostgreSQL Client]', 'chan1'],
				['[PostgreSQL Client]', 'pay1']
			])
			expect(capture.events).to.have.length(1)
			expect(capture.events[0]).to.deep.include({
				message: '[PostgreSQL Client] notification: [object Object]',
				level: 'warning'
			})
			expect(capture.events[0]?.extra).to.deep.include({ channel: 'chan1', payload: 'pay1' })
		})

		it('notice listener reports a warning with the notice text', async () => {
			const { pgClient, PostgreSQLClientConnect } = await connectFresh()
			sinon.stub(console, 'info')
			await PostgreSQLClientConnect()
			const capture = startSentryCapture()
			try {
				pgClient.emit('notice', 'some notice')
			} finally {
				await capture.stop()
			}
			expect(capture.events).to.have.length(1)
			expect(capture.events[0]).to.deep.include({ message: '[PostgreSQL Client] notice: some notice', level: 'warning' })
		})

		it('disconnect logs progress and success, failure throws prefixed message', async () => {
			const { pgClient, PostgreSQLClientDisconnect } = await import('../../dist/dataSources/PostgreSQL.mjs')
			const info = sinon.stub(console, 'info')
			const end = sinon.stub(pgClient, 'end')
			end.resolves()
			await PostgreSQLClientDisconnect()
			expect(info.getCalls().map((c) => c.args)).to.deep.equal([
				['[PostgreSQL Client] Try close connection to database... '],
				['[PostgreSQL Client] OK: PostgreSQL connection has been closed successfully.']
			])
			end.rejects(new Error('end fail'))
			let caught: unknown
			try {
				await PostgreSQLClientDisconnect()
			} catch (e) {
				caught = e
			}
			expect(caught).to.deep.equal({
				message: '[PostgreSQL Client] FAIL: Unable to close the database connection: Error: end fail',
				shutdown: true
			})
		})

		it('pool disconnect logs progress and success, failure throws prefixed message', async () => {
			const { pgPool, PostgreSQLPoolDisconnect } = await import('../../dist/dataSources/PostgreSQL.mjs')
			const log = sinon.stub(console, 'log')
			const info = sinon.stub(console, 'info')
			const end = sinon.stub(pgPool, 'end')
			end.resolves()
			await PostgreSQLPoolDisconnect()
			expect(log.getCalls().map((c) => c.args)).to.deep.equal([['[PostgreSQL Pool] Try close connection to database... ']])
			expect(info.getCalls().map((c) => c.args)).to.deep.equal([
				['[PostgreSQL Pool] OK: PostgreSQL connection has been closed successfully.']
			])
			end.rejects(new Error('pool end fail'))
			let caught: unknown
			try {
				await PostgreSQLPoolDisconnect()
			} catch (e) {
				caught = e
			}
			expect(caught).to.deep.equal({
				message: '[PostgreSQL Pool] FAIL: Unable to close the database connection: Error: pool end fail',
				shutdown: true
			})
		})
	})
})
