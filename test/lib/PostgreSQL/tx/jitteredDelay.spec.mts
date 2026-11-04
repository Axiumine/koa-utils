import { jitteredDelay } from '@lib/PostgreSQL/tx/jitteredDelay.mjs'
import { TX_RETRY_BASE_DELAY_MS } from '@lib/PostgreSQL/tx/TX_RETRY_BASE_DELAY_MS.mjs'
import { expect } from 'chai'
import crypto from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'
import sinon from 'sinon'

describe('jitteredDelay', () => {
	let clock: sinon.SinonFakeTimers

	beforeEach(() => {
		clock = sinon.useFakeTimers()
	})

	afterEach(() => {
		clock.restore()
		sinon.restore()
		syncBuiltinESMExports()
	})

	it('waits from 0 to the base times two to the power of retry - 1, both ends included', async () => {
		const asked: number[] = []
		const delay = jitteredDelay((max) => {
			asked.push(max)
			// max - 1 = longest wait the range holds
			return max - 1
		})
		for (const retry of [1, 2, 3]) {
			let done = false
			const waiting = delay(retry).then(() => {
				done = true
			})
			const wait = TX_RETRY_BASE_DELAY_MS * 2 ** (retry - 1)
			await clock.tickAsync(wait - 1)
			expect(done, `retry ${String(retry)} early`).to.equal(false)
			await clock.tickAsync(1)
			await waiting
			expect(done, `retry ${String(retry)} on time`).to.equal(true)
		}
		expect(asked).to.deep.equal([26, 51, 101])
	})

	it('can be zero', async () => {
		let done = false
		const waiting = jitteredDelay(() => 0)(1).then(() => {
			done = true
		})
		await clock.tickAsync(0)
		await waiting
		expect(done).to.equal(true)
	})

	it('draws from node:crypto randomInt by default, with the same range', async () => {
		const stub = sinon.stub(crypto, 'randomInt').callsFake((() => 17) as never)
		// named import in jitteredDelay read live binding → sync needed after stub
		syncBuiltinESMExports()
		let done = false
		const waiting = jitteredDelay()(3).then(() => {
			done = true
		})
		await clock.tickAsync(16)
		expect(done).to.equal(false)
		await clock.tickAsync(1)
		await waiting
		expect(done).to.equal(true)
		expect(stub.args).to.deep.equal([[101]])
	})
})
