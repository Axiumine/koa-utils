import { catalogRow } from '@private/lib/PostgreSQL/catalogRow.mjs'
import { expect } from 'chai'

import { FakeTxWorld } from '../../../helpers/fakeTxPool.mjs'

// exactly 1 row, an object. Message pinned here: assertRole swallow the TypeError, only this spec see it

async function thrownBy(rows: unknown[]): Promise<unknown> {
	const world = new FakeTxWorld(() => ({ rows }))
	const client = await world.pool.connect()
	try {
		await catalogRow(client, 'SELECT 1')
	} catch (error) {
		return error
	}
	return undefined
}

describe('catalogRow', () => {
	it('answers the one row', async () => {
		const world = new FakeTxWorld(() => ({ rows: [{ a: 1 }] }))
		const client = await world.pool.connect()
		expect(await catalogRow(client, 'SELECT 1')).to.deep.equal({ a: 1 })
	})

	it('passes the values on, when there are any', async () => {
		const world = new FakeTxWorld(() => ({ rows: [{ a: 1 }] }))
		const client = await world.pool.connect()
		await catalogRow(client, 'SELECT $1', ['x'])
		await catalogRow(client, 'SELECT 1')
		expect(world.calls.map((call) => [call.values, call.argc])).to.deep.equal([
			[['x'], 2],
			[undefined, 1]
		])
	})

	it('throws a TypeError for no row, two rows, and a row that is not an object', async () => {
		for (const rows of [[], [{}, {}], [null], ['x'], [5], [undefined]]) {
			const error = await thrownBy(rows)
			expect(error, JSON.stringify(rows)).to.be.instanceOf(TypeError)
			expect((error as Error).message).to.equal('the catalog answered an unexpected number of rows')
		}
	})

	it('accepts an array as the row, which is an object', async () => {
		const world = new FakeTxWorld(() => ({ rows: [[1]] }))
		const client = await world.pool.connect()
		expect(await catalogRow(client, 'SELECT 1')).to.deep.equal([1])
	})
})
