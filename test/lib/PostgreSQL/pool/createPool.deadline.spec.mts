import { DbConnectError } from '@lib/PostgreSQL/error/DbConnectError.mjs'
import { DEFAULT_CONNECT_TIMEOUT_MS } from '@lib/PostgreSQL/pool/DEFAULT_CONNECT_TIMEOUT_MS.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

import { HANG } from '../../../helpers/fakePgDriver.mjs'
import { setup } from '../../../helpers/poolHarness.mjs'

const settled = (promise: Promise<unknown>): Promise<unknown> => promise.catch((error: unknown) => error)

describe('createPool: the connect deadline', () => {
	let clock: sinon.SinonFakeTimers

	beforeEach(() => {
		clock = sinon.useFakeTimers()
	})

	afterEach(() => {
		clock.restore()
	})

	it('fails a connect that never answers with CONNECT_TIMEOUT after connectTimeoutMs', async () => {
		const { pool, world, counts, log } = setup({ connect: HANG }, { connectTimeoutMs: 700 })
		const caught = settled(pool.checkout())
		await clock.tickAsync(699)
		// 1 ms before deadline → still waiting, client alive
		expect(world.clients[0]?.ended).to.equal(0)
		await clock.tickAsync(1)
		const error = await caught
		expect(error).to.be.instanceOf(DbConnectError)
		expect((error as DbConnectError).reason).to.equal('CONNECT_TIMEOUT')
		expect(world.clients[0]?.ended).to.equal(1)
		expect(counts).to.deep.equal(['db_pool_connect_failures_total'])
		expect(log.calls[0]?.fields).to.deep.equal({ reason: 'CONNECT_TIMEOUT' })
	})

	it('uses the default deadline when none is given', async () => {
		const { pool } = setup({ connect: HANG })
		const caught = settled(pool.checkout())
		await clock.tickAsync(DEFAULT_CONNECT_TIMEOUT_MS - 1)
		expect(clock.countTimers()).to.equal(1)
		await clock.tickAsync(1)
		expect(((await caught) as DbConnectError).reason).to.equal('CONNECT_TIMEOUT')
	})

	it('covers the session check too: a server that logs in and never answers the query', async () => {
		const { pool } = setup({ timeZone: HANG }, { connectTimeoutMs: 300 })
		const caught = settled(pool.checkout())
		await clock.tickAsync(299)
		expect(clock.countTimers()).to.equal(1)
		await clock.tickAsync(1)
		expect(((await caught) as DbConnectError).reason).to.equal('CONNECT_TIMEOUT')
	})

	it('clears its timer when the connect succeeds or fails', async () => {
		const ok = setup({}, { connectTimeoutMs: 300 })
		await ok.pool.checkout()
		expect(clock.countTimers()).to.equal(0)
		const bad = setup({ timeZone: 'Asia/Tokyo' }, { connectTimeoutMs: 300 })
		await settled(bad.pool.checkout())
		expect(clock.countTimers()).to.equal(0)
	})

	it('does not count or log twice when the deadline fires and the work settles later', async () => {
		const { pool, counts } = setup({ connect: HANG }, { connectTimeoutMs: 100 })
		const caught = settled(pool.checkout())
		await clock.tickAsync(100)
		await caught
		await clock.tickAsync(10_000)
		expect(counts).to.deep.equal(['db_pool_connect_failures_total'])
	})
})
