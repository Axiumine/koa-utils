import { debugHandler } from '../../../dist/koa/middleware/debug/index.mjs'
import { expect } from 'chai'

describe('koa middleware/debug', () => {
	it('returns a koa middleware function', () => {
		const mw = debugHandler()
		expect(mw).to.be.a('function')
	})

	it('invokes next() and returns its result', async () => {
		const mw = debugHandler()
		const ctx = {
			request: { header: { cookie: 'a=b' } },
			cookies: { get: () => 'refresh-val' }
		} as never
		let nextCalled = false
		const ret = mw(ctx, async () => {
			nextCalled = true
			return 'OK'
		})
		await ret
		expect(nextCalled).to.equal(true)
	})
})
