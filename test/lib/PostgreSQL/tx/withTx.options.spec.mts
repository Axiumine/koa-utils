import { MAX_LOCK_TIMEOUT_MS } from '@lib/PostgreSQL/tx/MAX_LOCK_TIMEOUT_MS.mjs'
import type { ITxOptions } from '@lib/PostgreSQL/tx/ITxOptions.mjs'
import { TX_RETRY_MAX_CEILING } from '@lib/PostgreSQL/tx/TX_RETRY_MAX_CEILING.mjs'
import { withTx } from '@lib/PostgreSQL/tx/withTx.mjs'
import { expect } from 'chai'

import { appErrors } from '../../../helpers/appErrors.mjs'
import { driverError, failNth, rejection } from '../../../helpers/fakeTxPool.mjs'
import { DRIVER_TEXT, noWait, txSetup } from '../../../helpers/txHarness.mjs'

const ISOLATION_MESSAGE = 'isolation must be one of READ COMMITTED, REPEATABLE READ, SERIALIZABLE'
const LOCK_MESSAGE = `lockTimeoutMs must be a whole number of milliseconds from 1 to ${String(MAX_LOCK_TIMEOUT_MS)}`
const RETRY_MESSAGE = `retryMax must be a whole number from 0 to ${String(TX_RETRY_MAX_CEILING)}`

describe('withTx: the options', () => {
	const bad: [string, Record<string, unknown>, string][] = [
		['isolation', { isolation: 'READ UNCOMMITTED' }, ISOLATION_MESSAGE],
		// inherited key of the table object → still refused
		['isolation', { isolation: 'toString' }, ISOLATION_MESSAGE],
		['isolation', { isolation: '' }, ISOLATION_MESSAGE],
		['lockTimeoutMs', { lockTimeoutMs: 0 }, LOCK_MESSAGE],
		['lockTimeoutMs', { lockTimeoutMs: -1 }, LOCK_MESSAGE],
		['lockTimeoutMs', { lockTimeoutMs: 1.5 }, LOCK_MESSAGE],
		['lockTimeoutMs', { lockTimeoutMs: Number.NaN }, LOCK_MESSAGE],
		['lockTimeoutMs', { lockTimeoutMs: MAX_LOCK_TIMEOUT_MS + 1 }, LOCK_MESSAGE],
		['lockTimeoutMs', { lockTimeoutMs: '3000; DROP TABLE x' }, LOCK_MESSAGE],
		['retryMax', { retryMax: -1 }, RETRY_MESSAGE],
		['retryMax', { retryMax: 0.5 }, RETRY_MESSAGE],
		['retryMax', { retryMax: TX_RETRY_MAX_CEILING + 1 }, RETRY_MESSAGE],
		['retryMax', { retryMax: Number.POSITIVE_INFINITY }, RETRY_MESSAGE]
	]
	for (const [name, override, message] of bad) {
		it(`refuses a bad ${name} before a connection is taken (${JSON.stringify(override)})`, async () => {
			const { world, options } = txSetup()
			const failure = await rejection(withTx(world.pool, { ...options, ...override } as ITxOptions, () => Promise.resolve()))
			expect(failure).to.be.instanceOf(TypeError)
			expect((failure as Error).message).to.equal(message)
			expect(world.clients).to.have.length(0)
			expect(world.calls).to.have.length(0)
		})
	}

	it('checks the isolation first, then the lock timeout, then the retry count', async () => {
		const { world, options } = txSetup()
		const all = { ...options, isolation: 'x', lockTimeoutMs: 0, retryMax: -1 } as unknown as ITxOptions
		expect(((await rejection(withTx(world.pool, all, () => Promise.resolve()))) as Error).message).to.equal(ISOLATION_MESSAGE)
		const two = { ...options, lockTimeoutMs: 0, retryMax: -1 }
		expect(((await rejection(withTx(world.pool, two, () => Promise.resolve()))) as Error).message).to.equal(LOCK_MESSAGE)
	})

	const ends: Partial<ITxOptions>[] = [
		{ lockTimeoutMs: 1 },
		{ lockTimeoutMs: MAX_LOCK_TIMEOUT_MS },
		{ retryMax: 0 },
		{ retryMax: TX_RETRY_MAX_CEILING }
	]
	for (const end of ends) {
		it(`accepts the end of the range ${JSON.stringify(end)}`, async () => {
			const { world, options } = txSetup(end)
			await withTx(world.pool, options, () => Promise.resolve())
			expect(world.texts.at(-1)).to.equal('COMMIT')
		})
	}

	it('counts nowhere when no counter is given', async () => {
		const { world, log } = txSetup()
		const withoutCounter: ITxOptions = { logger: log.logger, errors: appErrors, retryDelay: noWait }
		world.respond = failNth('SELECT 1', [1], () => driverError('40001', DRIVER_TEXT))
		const result = await withTx(world.pool, withoutCounter, async (tx) => {
			await tx.query('SELECT 1')
			return 1
		})
		expect(result).to.equal(1)
		expect(log.calls.map((call) => call.message)).to.deep.equal(['database transaction retried'])
	})
})
