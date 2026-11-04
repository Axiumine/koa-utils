import { withTx } from '@lib/PostgreSQL/tx/withTx.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

import { AppError } from '../../../helpers/appErrors.mjs'
import { driverError, failNth, rejection } from '../../../helpers/fakeTxPool.mjs'
import { CONSTRAINT, DRIVER_TEXT, txSetup, VALUE } from '../../../helpers/txHarness.mjs'

describe('withTx: commit and rollback', () => {
	it('rolls back when fn throws, and throws the same error object', async () => {
		const { world, options } = txSetup()
		const planted = new Error('planted failure of fn')
		const failure = await rejection(
			withTx(world.pool, options, async (tx) => {
				await tx.query('SELECT 1')
				throw planted
			})
		)
		expect(failure).to.equal(planted)
		expect(world.texts).to.deep.equal([
			'BEGIN ISOLATION LEVEL READ COMMITTED',
			'SET LOCAL lock_timeout = 3000',
			'SELECT 1',
			'ROLLBACK'
		])
		expect(world.clients[0]?.released).to.deep.equal([false])
		expect(world.clients[0]?.listenerCount('error')).to.equal(0)
	})

	const notRetried: [string, unknown][] = [
		['a unique violation', driverError('23505', DRIVER_TEXT, { constraint: CONSTRAINT })],
		['a read-only violation', driverError('25006', 'cannot execute INSERT in a read-only transaction')],
		['a reset connection', driverError('ECONNRESET', 'read ECONNRESET')],
		['a four character code', driverError('4000', 'four characters')],
		['a lower case code', driverError('40p01', 'lower case')],
		['an error of the app family', new AppError('FORBIDDEN')],
		['a string', 'a string'],
		['a number', 42],
		['null', null],
		['a numeric code', { code: 40001 }]
	]
	for (const [label, planted] of notRetried) {
		it(`rethrows ${label} unchanged and without a retry`, async () => {
			const { world, options, counts, log } = txSetup()
			// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- non-Error rejection is the case under test
			const runs = sinon.stub().callsFake(() => Promise.reject(planted))
			const failure = await rejection(withTx(world.pool, options, runs as () => Promise<never>))
			expect(failure).to.equal(planted)
			expect(runs.callCount).to.equal(1)
			expect(world.clients).to.have.length(1)
			expect(world.texts.at(-1)).to.equal('ROLLBACK')
			expect(counts).to.deep.equal([])
			expect(log.calls).to.deep.equal([])
		})
	}

	it('rethrows a synchronous throw of fn after the rollback', async () => {
		const { world, options } = txSetup()
		const planted = new Error('sync')
		const failure = await rejection(
			withTx(world.pool, options, (): Promise<void> => {
				throw planted
			})
		)
		expect(failure).to.equal(planted)
		expect(world.texts.at(-1)).to.equal('ROLLBACK')
	})

	it('does not hide the original error when the rollback fails, and destroys the connection', async () => {
		const { world, options, log, counts } = txSetup()
		const original = driverError('23505', DRIVER_TEXT, { constraint: CONSTRAINT })
		world.respond = (call) => {
			if (call.text === 'ROLLBACK') throw driverError('08006', `${DRIVER_TEXT} ${VALUE}`)
			return undefined
		}
		const failure = await rejection(withTx(world.pool, options, () => Promise.reject(original)))
		expect(failure).to.equal(original)
		expect(world.clients[0]?.released).to.deep.equal([true])
		expect(world.clients[0]?.listenerCount('error')).to.equal(0)
		expect(counts).to.deep.equal(['db_tx_rollback_failures_total'])
		expect(log.calls).to.deep.equal([
			{
				level: 'error',
				message: 'database transaction rollback failed',
				fields: { reason: 'ROLLBACK_FAILED', sqlstate: '08006' }
			}
		])
		const text = JSON.stringify(log.calls)
		expect(text).not.to.contain('PLANTED')
		expect(text).not.to.contain(VALUE)
	})

	it('logs a failed rollback without a SQLSTATE when the error has none', async () => {
		const { world, options, log } = txSetup()
		world.respond = (call) => {
			// eslint-disable-next-line @typescript-eslint/only-throw-error -- non-Error throw is the case under test
			if (call.text === 'ROLLBACK') throw 'not an error'
			return undefined
		}
		await rejection(withTx(world.pool, options, () => Promise.reject(new Error('x'))))
		expect(log.calls[0]?.fields).to.deep.equal({ reason: 'ROLLBACK_FAILED' })
	})

	it('rolls back and rethrows when the BEGIN itself fails', async () => {
		const { world, options } = txSetup()
		const planted = driverError('57P03', 'the database system is starting up')
		world.respond = failNth('BEGIN ISOLATION LEVEL READ COMMITTED', [1], () => planted)
		const fn = sinon.stub().resolves(1)
		expect(await rejection(withTx(world.pool, options, fn as () => Promise<number>))).to.equal(planted)
		expect(fn.called).to.equal(false)
		expect(world.texts).to.deep.equal(['BEGIN ISOLATION LEVEL READ COMMITTED', 'ROLLBACK'])
		expect(world.clients[0]?.released).to.deep.equal([false])
	})

	it('rolls back and rethrows when the SET LOCAL itself fails', async () => {
		const { world, options } = txSetup()
		const planted = driverError('42601', 'syntax error')
		world.respond = failNth('SET LOCAL lock_timeout = 3000', [1], () => planted)
		const fn = sinon.stub().resolves(1)
		expect(await rejection(withTx(world.pool, options, fn as () => Promise<number>))).to.equal(planted)
		expect(fn.called).to.equal(false)
		expect(world.texts.at(-1)).to.equal('ROLLBACK')
	})

	it('passes a failure to take a connection on unchanged, with nothing to release', async () => {
		const { world, options } = txSetup()
		const planted = new Error('no connection')
		world.connectError = planted
		const fn = sinon.stub().resolves(1)
		expect(await rejection(withTx(world.pool, options, fn as () => Promise<number>))).to.equal(planted)
		expect(fn.called).to.equal(false)
		expect(world.clients).to.have.length(0)
		expect(world.calls).to.have.length(0)
	})
})
