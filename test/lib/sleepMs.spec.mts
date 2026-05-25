import { sleepMs } from '@lib/sleepMs.mjs'
import { expect } from 'chai'

describe('sleepMs', () => {
	it('resolves after at least the requested ms', async () => {
		const start = Date.now()
		await sleepMs(40)
		const elapsed = Date.now() - start
		expect(elapsed).to.be.at.least(35)
	})

	it('returns a promise', () => {
		const p = sleepMs(0)
		expect(p).to.be.instanceOf(Promise)
		return p
	})
})
