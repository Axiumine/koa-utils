import { expect } from 'chai'
import sinon from 'sinon'

// Sentry.captureException is non-stubbable in ESM (non-configurable live binding).
// We stub instance methods on pgClient/pgPool (mutable object properties).

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
		// reset listeners so they attach fresh
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
		// Sentry.captureException is non-stubbable; just verify it does not throw
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
})
