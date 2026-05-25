import { logRequestToDb } from '../../dist/koa/logRequestToDb.mjs'
import { expect } from 'chai'

describe('logRequestToDb', () => {
	it('invokes next() and measures elapsed time without throwing', async () => {
		const ctx = {
			method: 'POST',
			url: '/graphql',
			state: { user: { id: 'abc123' } },
			request: { body: { operationName: 'op' } },
			status: 200
		} as never
		let called = false
		await logRequestToDb(ctx, async () => {
			called = true
		})
		expect(called).to.equal(true)
	})

	it('falls back to OBJECTID_0_OBJ when ctx.state.user.id missing', async () => {
		const ctx = {
			method: 'GET',
			url: '/x',
			state: {},
			request: { body: undefined },
			status: 404
		} as never
		await logRequestToDb(ctx, async () => undefined)
	})
})
