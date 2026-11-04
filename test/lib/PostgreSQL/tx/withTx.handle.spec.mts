import { DbTxError } from '@lib/PostgreSQL/error/DbTxError.mjs'
import type { ITx } from '@lib/PostgreSQL/tx/ITx.mjs'
import { withTx } from '@lib/PostgreSQL/tx/withTx.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

import { driverError, failNth, leakText, rejection } from '../../../helpers/fakeTxPool.mjs'
import { CONSTRAINT, DRIVER_TEXT, txSetup, VALUE } from '../../../helpers/txHarness.mjs'

describe('withTx: the handle', () => {
	it('has one member, query, and reaches neither the pool nor the connection', async () => {
		const { world, options } = txSetup()
		let seen: ITx | undefined
		await withTx(world.pool, options, (tx) => {
			seen = tx
			return Promise.resolve()
		})
		const tx = seen as ITx
		expect(Reflect.ownKeys(tx)).to.deep.equal(['query'])
		expect(Object.isFrozen(tx)).to.equal(true)
		expect(Object.getPrototypeOf(tx)).to.equal(Object.prototype)
		// walk every property, getter, setter, prototype: pool and clients must not show up
		const reachable = new Set<unknown>()
		const walk = (value: unknown): void => {
			if (typeof value !== 'object' && typeof value !== 'function') return
			if (value === null || reachable.has(value)) return
			reachable.add(value)
			for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
				walk(descriptor.value)
				walk(Reflect.get(descriptor, 'get'))
				walk(Reflect.get(descriptor, 'set'))
			}
			walk(Object.getPrototypeOf(value))
		}
		walk(tx)
		expect(reachable.has(world.pool)).to.equal(false)
		for (const client of world.clients) expect(reachable.has(client)).to.equal(false)
		for (const name of ['connect', 'release', 'end', 'pool', 'client', 'on']) {
			expect((tx as unknown as Record<string, unknown>)[name], name).to.equal(undefined)
		}
	})

	it('refuses a statement after the transaction ended, so a kept handle cannot reach the connection', async () => {
		const { world, options } = txSetup()
		let kept: ITx | undefined
		await withTx(world.pool, options, (tx) => {
			kept = tx
			return Promise.resolve()
		})
		const before = world.calls.length
		const failure = await rejection((kept as ITx).query('DELETE FROM t'))
		expect(failure).to.be.instanceOf(DbTxError)
		expect(failure).to.deep.include({ reason: 'HANDLE_CLOSED' })
		expect((failure as Error).message).to.equal('database transaction misused: HANDLE_CLOSED')
		expect(world.calls).to.have.length(before)
	})

	it('refuses a statement after a rollback too', async () => {
		const { world, options } = txSetup()
		let kept: ITx | undefined
		await rejection(
			withTx(world.pool, options, (tx) => {
				kept = tx
				return Promise.reject(new Error('x'))
			})
		)
		const failure = await rejection((kept as ITx).query('SELECT 1'))
		expect(failure).to.be.instanceOf(DbTxError)
		expect(world.texts).not.to.contain('SELECT 1')
	})

	it('refuses a statement while the commit is running', async () => {
		const { world, options } = txSetup()
		let kept: ITx | undefined
		let late: Promise<unknown> | undefined
		world.respond = (call) => {
			// handler attached at once → no unhandled rejection while commit runs
			if (call.text === 'COMMIT') late = rejection((kept as ITx).query('SELECT 2'))
			return undefined
		}
		await withTx(world.pool, options, (tx) => {
			kept = tx
			return Promise.resolve()
		})
		expect(await (late as Promise<unknown>)).to.be.instanceOf(DbTxError)
		expect(world.texts).not.to.contain('SELECT 2')
	})

	it('passes the answer of a statement through', async () => {
		const { world, options } = txSetup()
		world.respond = (call) => (call.text === 'SELECT 1' ? { rows: [{ n: 1 }], rowCount: 1, command: 'SELECT' } : undefined)
		const result = await withTx(world.pool, options, (tx) => tx.query<{ n: number }>('SELECT 1'))
		expect(result).to.deep.equal({ rows: [{ n: 1 }], rowCount: 1, command: 'SELECT' })
	})

	it('passes the error of a statement through unchanged to fn', async () => {
		const { world, options } = txSetup()
		const planted = driverError('23505', DRIVER_TEXT, { constraint: CONSTRAINT })
		world.respond = failNth('INSERT', [1], () => planted)
		const caught = await withTx(world.pool, options, async (tx) => {
			const failure = await rejection(tx.query('INSERT'))
			await tx.query('ROLLBACK TO SAVEPOINT s')
			return failure
		})
		expect(caught).to.equal(planted)
	})
})

describe('withTx: a failed statement that fn swallows', () => {
	it('is not reported as a success: the COMMIT that the server turns into ROLLBACK throws the first failure', async () => {
		const { world, options } = txSetup()
		const first = driverError('23505', DRIVER_TEXT, { constraint: CONSTRAINT })
		const second = driverError('23505', 'second failure', { constraint: CONSTRAINT })
		let failures = 0
		world.respond = (call) => {
			if (call.text === 'INSERT') throw (failures += 1) === 1 ? first : second
			if (call.text === 'COMMIT') return { command: 'ROLLBACK' }
			return undefined
		}
		const failure = await rejection(
			withTx(world.pool, options, async (tx) => {
				await tx.query('INSERT').catch(() => undefined)
				await tx.query('INSERT').catch(() => undefined)
				return 'looks fine'
			})
		)
		// first failed statement wins, later ones do not replace it
		expect(failure).to.equal(first)
		expect(world.texts.at(-1)).to.equal('ROLLBACK')
	})

	it('is still retried when the swallowed failure was a deadlock', async () => {
		const { world, options, counts } = txSetup()
		let runs = 0
		world.respond = (call) => {
			if (call.text === 'LOCK' && runs === 1) throw driverError('40P01', DRIVER_TEXT)
			if (call.text === 'COMMIT' && runs === 1) return { command: 'ROLLBACK' }
			return undefined
		}
		const result = await withTx(world.pool, options, async (tx) => {
			runs += 1
			await tx.query('LOCK').catch(() => undefined)
			return runs
		})
		expect(result).to.equal(2)
		expect(counts).to.deep.equal(['db_tx_retries_total'])
	})

	it('is a DbTxError when the COMMIT came back as ROLLBACK and no failure is known', async () => {
		const { world, options } = txSetup()
		world.respond = (call) => (call.text === 'COMMIT' ? { command: 'ROLLBACK' } : undefined)
		const failure = await rejection(withTx(world.pool, options, () => Promise.resolve(1)))
		expect(failure).to.be.instanceOf(DbTxError)
		expect(failure).to.deep.include({ reason: 'COMMIT_ROLLED_BACK' })
		expect(world.texts.at(-1)).to.equal('ROLLBACK')
	})

	it('is not an error when fn recovers with a savepoint and the COMMIT is a COMMIT', async () => {
		const { world, options } = txSetup()
		world.respond = failNth('INSERT', [1], () => driverError('23505', DRIVER_TEXT))
		const result = await withTx(world.pool, options, async (tx) => {
			await tx.query('SAVEPOINT s')
			await tx.query('INSERT').catch(() => tx.query('ROLLBACK TO SAVEPOINT s'))
			return 'recovered'
		})
		expect(result).to.equal('recovered')
		expect(world.texts.at(-1)).to.equal('COMMIT')
	})
})

describe('withTx: the connection of a running transaction', () => {
	it('has a listener for its error event, so the event does not end the process, and is destroyed after it', async () => {
		const { world, options, log, counts } = txSetup()
		const fn = sinon.stub().callsFake(() => {
			const client = world.clients[0]
			expect(client?.listenerCount('error')).to.equal(1)
			expect(() => client?.emit('error', driverError('57P01', `${DRIVER_TEXT} ${VALUE}`))).not.to.throw()
			expect(() => client?.emit('error', new Error('no code'))).not.to.throw()
			return Promise.resolve('survived')
		})
		expect(await withTx(world.pool, options, fn as () => Promise<string>)).to.equal('survived')
		expect(world.clients[0]?.released).to.deep.equal([true])
		expect(world.clients[0]?.listenerCount('error')).to.equal(0)
		expect(counts).to.deep.equal(['db_tx_client_errors_total', 'db_tx_client_errors_total'])
		expect(log.calls).to.deep.equal([
			{
				level: 'error',
				message: 'database client error during transaction',
				fields: { reason: 'CLIENT_ERROR', sqlstate: '57P01' }
			},
			{ level: 'error', message: 'database client error during transaction', fields: { reason: 'CLIENT_ERROR' } }
		])
		const text = leakText(new Error('clean'), log.calls)
		expect(text).not.to.contain('PLANTED')
		expect(text).not.to.contain(VALUE)
	})
})
