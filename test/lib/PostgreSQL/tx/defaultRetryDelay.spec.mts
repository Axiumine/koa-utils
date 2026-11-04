import { defaultRetryDelay } from '@lib/PostgreSQL/tx/defaultRetryDelay.mjs'
import { TX_RETRY_BASE_DELAY_MS } from '@lib/PostgreSQL/tx/TX_RETRY_BASE_DELAY_MS.mjs'
import { withTx } from '@lib/PostgreSQL/tx/withTx.mjs'
import { expect } from 'chai'
import crypto from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'
import sinon from 'sinon'

import { driverError } from '../../../helpers/fakeTxPool.mjs'
import { DRIVER_TEXT, txSetup } from '../../../helpers/txHarness.mjs'

describe('defaultRetryDelay', () => {
	let clock: sinon.SinonFakeTimers

	beforeEach(() => {
		clock = sinon.useFakeTimers()
	})

	afterEach(() => {
		clock.restore()
		sinon.restore()
		syncBuiltinESMExports()
	})

	it('is a random wait drawn from the system generator, one timer per wait', async () => {
		const started = clock.countTimers()
		const waiting = defaultRetryDelay(2)
		expect(clock.countTimers()).to.equal(started + 1)
		await clock.tickAsync(TX_RETRY_BASE_DELAY_MS * 2)
		await waiting
		expect(clock.countTimers()).to.equal(started)
	})

	it('is what withTx waits with when no delay is injected', async () => {
		sinon.stub(crypto, 'randomInt').callsFake((() => TX_RETRY_BASE_DELAY_MS) as never)
		syncBuiltinESMExports()
		const { world, options } = txSetup()
		const { retryDelay: injected, ...withoutDelay } = options
		void injected
		const fn = sinon.stub()
		fn.onFirstCall().rejects(driverError('40001', DRIVER_TEXT))
		fn.resolves('after the wait')
		const running = withTx(world.pool, withoutDelay, fn as () => Promise<string>)
		await clock.tickAsync(TX_RETRY_BASE_DELAY_MS - 1)
		expect(fn.callCount, 'still waiting').to.equal(1)
		await clock.tickAsync(1)
		expect(await running).to.equal('after the wait')
		expect(fn.callCount).to.equal(2)
	})
})
