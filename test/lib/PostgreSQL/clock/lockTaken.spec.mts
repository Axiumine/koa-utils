import { CLOCK_SQL } from '@lib/PostgreSQL/clock/CLOCK_SQL.mjs'
import { createDbClock } from '@lib/PostgreSQL/clock/createDbClock.mjs'
import { lockTaken } from '@lib/PostgreSQL/clock/lockTaken.mjs'
import { expect } from 'chai'

import { failureOf, RecordingTx } from '../../../helpers/recordingTx.mjs'

const ms = (text: string): unknown[] => [{ ms: text }]

describe('lockTaken', () => {
	it('adds no statement to a transaction that has no clock', async () => {
		const tx = new RecordingTx()
		expect(await lockTaken(tx)).to.equal(undefined)
		expect(tx.calls).to.have.length(0)
	})

	it('reads the instant right away for a clock that is bound', async () => {
		const tx = new RecordingTx(ms('1700000000123'))
		const clock = createDbClock(tx, { write: true })
		await lockTaken(tx)
		expect(tx.texts).to.deep.equal([CLOCK_SQL])
		expect(clock.now()).to.equal(1700000000123)
	})

	it('waits for the read: its promise settles after the instant is there', async () => {
		const tx = new RecordingTx(ms('1700000000123'))
		const clock = createDbClock(tx, { write: false })
		let done = false
		const pending = lockTaken(tx).then(() => {
			done = true
		})
		expect(done).to.equal(false)
		await pending
		expect(done).to.equal(true)
		expect(clock.now()).to.equal(1700000000123)
	})

	it('reads once whatever the number of locks', async () => {
		const tx = new RecordingTx(ms('1700000000123'), ms('1700000000999'))
		createDbClock(tx, { write: true })
		await lockTaken(tx)
		await lockTaken(tx)
		await Promise.all([lockTaken(tx), lockTaken(tx)])
		expect(tx.calls).to.have.length(1)
	})

	it('rejects with the failure of the read, which stays the answer of the clock', async () => {
		const boom = new Error('statement failed')
		const tx = new RecordingTx()
		tx.query = () => Promise.reject(boom)
		const clock = createDbClock(tx, { write: true })
		expect(await failureOf(lockTaken(tx))).to.equal(boom)
		expect(await failureOf(clock.read())).to.equal(boom)
	})

	it('keeps the state per handle: a lock on one handle does not unlock the write guard of another', async () => {
		const first = new RecordingTx(ms('1'))
		const second = new RecordingTx(ms('2'))
		const a = createDbClock(first, { write: true })
		const b = createDbClock(second, { write: true })
		await lockTaken(first)
		expect(a.now()).to.equal(1)
		expect(() => b.now()).to.throw(
			'the clock of a write transaction is read after the first lock helper has returned, not before'
		)
	})
})
