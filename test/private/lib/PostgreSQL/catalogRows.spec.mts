import { catalogRows } from '@private/lib/PostgreSQL/catalogRows.mjs'
import { expect } from 'chai'

import { FakeTxWorld } from '../../../helpers/fakeTxPool.mjs'

// one statement → rows. 1-arg call w/o values, 2-arg call with. Answer w/o list of rows → TypeError (message pinned: assertRole swallows it, only this spec can see it)

describe('catalogRows', () => {
	it('answers the rows of the statement', async () => {
		const world = new FakeTxWorld(() => ({ rows: [{ a: 1 }, { a: 2 }] }))
		const client = await world.pool.connect()
		expect(await catalogRows(client, 'SELECT 1')).to.deep.equal([{ a: 1 }, { a: 2 }])
	})

	it('sends the text alone when there are no values, and the text with the values when there are', async () => {
		const world = new FakeTxWorld()
		const client = await world.pool.connect()
		await catalogRows(client, 'SELECT 1')
		await catalogRows(client, 'SELECT $1', ['x'])
		await catalogRows(client, 'SELECT $1', [])
		expect(world.calls.map((call) => [call.text, call.values, call.argc])).to.deep.equal([
			['SELECT 1', undefined, 1],
			['SELECT $1', ['x'], 2],
			['SELECT $1', [], 2]
		])
	})

	it('answers an empty list for an empty answer', async () => {
		const world = new FakeTxWorld()
		const client = await world.pool.connect()
		expect(await catalogRows(client, 'SELECT 1')).to.deep.equal([])
	})

	it('throws a TypeError for an answer whose rows are not a list', async () => {
		for (const rows of ['x', null, undefined, {}, 5]) {
			const world = new FakeTxWorld(() => ({ rows }) as never)
			const client = await world.pool.connect()
			// FakeTxClient turns a missing rows field into [] → the cases above go through a client that answers the raw value
			client.query = () => Promise.resolve({ rows, rowCount: null, command: 'SELECT' } as never)
			let thrown: unknown
			try {
				await catalogRows(client, 'SELECT 1')
			} catch (error) {
				thrown = error
			}
			expect(thrown, String(rows)).to.be.instanceOf(TypeError)
			expect((thrown as Error).message).to.equal('the catalog answer has no rows')
		}
	})

	it('lets a failure of the statement through', async () => {
		const boom = new Error('boom')
		const world = new FakeTxWorld(() => {
			throw boom
		})
		const client = await world.pool.connect()
		let thrown: unknown
		try {
			await catalogRows(client, 'SELECT 1')
		} catch (error) {
			thrown = error
		}
		expect(thrown).to.equal(boom)
	})
})
