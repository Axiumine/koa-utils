import { DEFAULT_LOCK_TIMEOUT_MS } from '@lib/PostgreSQL/tx/DEFAULT_LOCK_TIMEOUT_MS.mjs'
import type { ITxIsolation } from '@lib/PostgreSQL/tx/ITxIsolation.mjs'
import { withTx } from '@lib/PostgreSQL/tx/withTx.mjs'
import { expect } from 'chai'

import { rejection } from '../../../helpers/fakeTxPool.mjs'
import { txSetup } from '../../../helpers/txHarness.mjs'

describe('withTx: the statements of one transaction', () => {
	it('opens at READ COMMITTED, sets the lock timeout locally, runs fn, commits, and returns the connection', async () => {
		const { world, options } = txSetup()
		const result = await withTx(world.pool, options, async (tx) => {
			await tx.query('SELECT 1')
			await tx.query('SELECT $1::int', [7])
			return 'done'
		})
		expect(result).to.equal('done')
		expect(world.texts).to.deep.equal([
			'BEGIN ISOLATION LEVEL READ COMMITTED',
			`SET LOCAL lock_timeout = ${String(DEFAULT_LOCK_TIMEOUT_MS)}`,
			'SELECT 1',
			'SELECT $1::int',
			'COMMIT'
		])
		expect(world.clients).to.have.length(1)
		expect(world.clients[0]?.released).to.deep.equal([false])
		expect(world.clients[0]?.listenerCount('error')).to.equal(0)
	})

	it('sends a statement with no values as one argument, and one with values as two', async () => {
		const { world, options } = txSetup()
		await withTx(world.pool, options, async (tx) => {
			await tx.query('SELECT 1')
			await tx.query('SELECT $1::int', [7])
			await tx.query('SELECT 2', [])
		})
		// 0..1 = BEGIN + SET LOCAL, 2.. = fn statements, last = COMMIT
		expect(world.calls.map((call) => call.argc)).to.deep.equal([1, 1, 1, 2, 2, 1])
		expect(world.calls[2]?.values).to.equal(undefined)
		expect(world.calls[3]?.values).to.deep.equal([7])
		expect(world.calls[4]?.values).to.deep.equal([])
	})

	const levels: [ITxIsolation, boolean, string][] = [
		['READ COMMITTED', false, 'BEGIN ISOLATION LEVEL READ COMMITTED'],
		['READ COMMITTED', true, 'BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY'],
		['REPEATABLE READ', false, 'BEGIN ISOLATION LEVEL REPEATABLE READ'],
		['REPEATABLE READ', true, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'],
		['SERIALIZABLE', false, 'BEGIN ISOLATION LEVEL SERIALIZABLE'],
		['SERIALIZABLE', true, 'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY']
	]
	for (const [isolation, readOnly, expected] of levels) {
		it(`opens ${isolation} with readOnly ${String(readOnly)} as "${expected}"`, async () => {
			const { world, options } = txSetup({ isolation, readOnly })
			await withTx(world.pool, options, () => Promise.resolve())
			expect(world.texts[0]).to.equal(expected)
		})
	}

	it('opens read-write when readOnly is left out', async () => {
		const { world, options } = txSetup({ isolation: 'SERIALIZABLE' })
		await withTx(world.pool, options, () => Promise.resolve())
		expect(world.texts[0]).to.equal('BEGIN ISOLATION LEVEL SERIALIZABLE')
	})

	it('puts the lock timeout option into SET LOCAL, in milliseconds', async () => {
		const { world, options } = txSetup({ lockTimeoutMs: 2_500 })
		await withTx(world.pool, options, () => Promise.resolve())
		expect(world.texts[1]).to.equal('SET LOCAL lock_timeout = 2500')
	})

	it('uses no form of SET other than SET LOCAL, on any path', async () => {
		const { world, options } = txSetup({ isolation: 'REPEATABLE READ', readOnly: true })
		await withTx(world.pool, options, () => Promise.resolve())
		await rejection(
			withTx(world.pool, options, () => {
				throw new Error('x')
			})
		)
		const sets = world.texts.filter((text) => /^SET\b/i.test(text))
		expect(sets.length).to.be.greaterThan(0)
		for (const text of sets) expect(text).to.match(/^SET LOCAL /)
	})

	it('answers what fn answers', async () => {
		const { world, options } = txSetup()
		const answer = { n: 1 }
		expect(await withTx(world.pool, options, () => Promise.resolve(answer))).to.equal(answer)
	})
})
