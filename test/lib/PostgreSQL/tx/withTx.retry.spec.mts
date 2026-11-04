import type { ITx } from '@lib/PostgreSQL/tx/ITx.mjs'
import { TX_RETRY_MAX } from '@lib/PostgreSQL/tx/TX_RETRY_MAX.mjs'
import { withTx } from '@lib/PostgreSQL/tx/withTx.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

import { AppError, appErrors } from '../../../helpers/appErrors.mjs'
import { driverError, failNth, leakText, rejection } from '../../../helpers/fakeTxPool.mjs'
import { CONSTRAINT, DRIVER_TEXT, txSetup, VALUE } from '../../../helpers/txHarness.mjs'

// fn that reject n times with each error in turn, then resolve value. Counted by stub
function failingThen(errors: unknown[], value: string): sinon.SinonStub<[ITx], Promise<string>> {
	const stub = sinon.stub<[ITx], Promise<string>>()
	errors.forEach((error, index) => {
		// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- same
		stub.onCall(index).callsFake(() => Promise.reject(error))
	})
	stub.resolves(value)
	return stub
}

describe('withTx: the retry', () => {
	for (const sqlstate of ['40001', '40P01']) {
		it(`runs fn again in a fresh transaction after ${sqlstate}`, async () => {
			const { world, options, log, counts } = txSetup()
			world.respond = failNth('SELECT 1', [1], () => driverError(sqlstate, DRIVER_TEXT))
			const delays: number[] = []
			const fn = sinon.stub<[ITx], Promise<string>>().callsFake(async (tx) => {
				await tx.query('SELECT 1')
				return 'second try'
			})
			const result = await withTx(
				world.pool,
				{
					...options,
					retryDelay: (retry) => {
						delays.push(retry)
						return Promise.resolve()
					}
				},
				fn
			)
			expect(result).to.equal('second try')
			expect(fn.callCount).to.equal(2)
			expect(delays).to.deep.equal([1])
			expect(world.clients).to.have.length(2)
			expect(world.clients.map((client) => client.released)).to.deep.equal([[false], [false]])
			expect(world.calls.filter((call) => call.client === 0).map((call) => call.text)).to.deep.equal([
				'BEGIN ISOLATION LEVEL READ COMMITTED',
				'SET LOCAL lock_timeout = 3000',
				'SELECT 1',
				'ROLLBACK'
			])
			expect(world.calls.filter((call) => call.client === 1).map((call) => call.text)).to.deep.equal([
				'BEGIN ISOLATION LEVEL READ COMMITTED',
				'SET LOCAL lock_timeout = 3000',
				'SELECT 1',
				'COMMIT'
			])
			expect(counts).to.deep.equal(['db_tx_retries_total'])
			expect(log.calls).to.deep.equal([
				{ level: 'warn', message: 'database transaction retried', fields: { reason: 'TX_RETRY', sqlstate, retry: 1 } }
			])
			expect(JSON.stringify(log.calls)).not.to.contain('PLANTED')
		})
	}

	it('retries a serialisation failure that surfaces at COMMIT', async () => {
		const { world, options } = txSetup()
		world.respond = failNth('COMMIT', [1], () => driverError('40001', DRIVER_TEXT))
		const fn = sinon.stub().resolves('ok')
		expect(await withTx(world.pool, options, fn as () => Promise<string>)).to.equal('ok')
		expect(fn.callCount).to.equal(2)
	})

	it('retries a failure thrown by fn itself, not only one raised by a statement', async () => {
		const { world, options } = txSetup()
		const fn = failingThen([driverError('40P01', DRIVER_TEXT)], 'ok')
		expect(await withTx(world.pool, options, fn)).to.equal('ok')
		expect(fn.callCount).to.equal(2)
	})

	it('defaults to TX_RETRY_MAX retries, so the failure after the last retry is TX_RETRY_EXHAUSTED', async () => {
		const internal = sinon.spy(appErrors.internal)
		const { world, options, log, counts } = txSetup({ errors: { internal } })
		const waits: number[] = []
		const fn = failingThen(
			Array.from({ length: 5 }, () => driverError('40001', DRIVER_TEXT, { constraint: CONSTRAINT, detail: VALUE })),
			'never'
		)
		const failure = await rejection(
			withTx(
				world.pool,
				{
					...options,
					retryDelay: (retry) => {
						waits.push(retry)
						return Promise.resolve()
					}
				},
				fn
			)
		)
		expect(fn.callCount).to.equal(TX_RETRY_MAX + 1)
		expect(waits).to.deep.equal([1, 2])
		expect(failure).to.be.instanceOf(AppError)
		expect(failure).to.deep.include({ code: 'INTERNAL', details: { reason: 'TX_RETRY_EXHAUSTED' } })
		// factory asked for the reason and nothing else
		expect(internal.args).to.deep.equal([['TX_RETRY_EXHAUSTED']])
		expect(counts).to.deep.equal(['db_tx_retries_total', 'db_tx_retries_total', 'db_tx_retry_exhausted_total'])
		expect(log.calls.map((call) => [call.level, call.message])).to.deep.equal([
			['warn', 'database transaction retried'],
			['warn', 'database transaction retried'],
			['error', 'database transaction failed']
		])
		expect(log.calls[0]?.fields).to.deep.equal({ reason: 'TX_RETRY', sqlstate: '40001', retry: 1 })
		expect(log.calls[1]?.fields).to.deep.equal({ reason: 'TX_RETRY', sqlstate: '40001', retry: 2 })
		expect(log.calls[2]?.fields).to.deep.equal({ reason: 'TX_RETRY_EXHAUSTED', sqlstate: '40001', attempts: 3 })
		expect(world.clients.every((client) => client.released[0] === false)).to.equal(true)
	})

	for (const [retryMax, runs] of [
		[0, 1],
		[1, 2],
		[5, 6]
	] as const) {
		it(`honours retryMax ${String(retryMax)}: fn runs ${String(runs)} time(s) before the loop gives up`, async () => {
			const { world, options } = txSetup({ retryMax })
			const fn = failingThen(
				Array.from({ length: 9 }, () => driverError('40P01', DRIVER_TEXT)),
				'never'
			)
			const failure = await rejection(withTx(world.pool, options, fn))
			expect(fn.callCount).to.equal(runs)
			expect(failure).to.deep.include({ code: 'INTERNAL', details: { reason: 'TX_RETRY_EXHAUSTED' } })
		})
	}

	it('gives back the very error the factory built, with nothing of the driver in it or in the log', async () => {
		const built = new Error('built by the factory')
		const { world, options, log } = txSetup({ retryMax: 0, errors: { internal: () => built } })
		const failure = await rejection(
			withTx(world.pool, options, () =>
				Promise.reject(driverError('40001', DRIVER_TEXT, { constraint: CONSTRAINT, detail: VALUE }))
			)
		)
		expect(failure).to.equal(built)
		const everything = leakText(failure, log.calls)
		for (const planted of ['PLANTED', 'serialize', CONSTRAINT, VALUE]) {
			expect(everything).not.to.contain(planted)
		}
	})
})

describe('withTx: the lock timeout', () => {
	it('is LOCK_TIMEOUT on SQLSTATE 55P03, without a retry', async () => {
		const internal = sinon.spy(appErrors.internal)
		const { world, options, log, counts } = txSetup({ errors: { internal } })
		const fn = failingThen(
			[driverError('55P03', 'canceling statement due to lock timeout', { constraint: CONSTRAINT, detail: VALUE })],
			'never'
		)
		const failure = await rejection(withTx(world.pool, options, fn))
		expect(fn.callCount).to.equal(1)
		expect(failure).to.be.instanceOf(AppError)
		expect(failure).to.deep.include({ code: 'INTERNAL', details: { reason: 'LOCK_TIMEOUT' } })
		expect(internal.args).to.deep.equal([['LOCK_TIMEOUT']])
		expect(counts).to.deep.equal(['db_tx_lock_timeouts_total'])
		expect(log.calls).to.deep.equal([
			{
				level: 'error',
				message: 'database transaction failed',
				fields: { reason: 'LOCK_TIMEOUT', sqlstate: '55P03', attempts: 1 }
			}
		])
		const everything = leakText(failure, log.calls)
		for (const planted of ['canceling', 'lock timeout', CONSTRAINT, VALUE]) {
			expect(everything).not.to.contain(planted)
		}
		expect(world.texts.at(-1)).to.equal('ROLLBACK')
	})

	it('is LOCK_TIMEOUT also after a retry, and counts the attempts', async () => {
		const { world, options, log } = txSetup()
		const fn = failingThen([driverError('40P01', DRIVER_TEXT), driverError('55P03', DRIVER_TEXT)], 'never')
		const failure = await rejection(withTx(world.pool, options, fn))
		expect(failure).to.deep.include({ details: { reason: 'LOCK_TIMEOUT' } })
		expect(fn.callCount).to.equal(2)
		expect(log.calls.at(-1)?.fields).to.deep.equal({ reason: 'LOCK_TIMEOUT', sqlstate: '55P03', attempts: 2 })
	})
})
