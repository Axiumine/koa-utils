import { createDbClock } from '@lib/PostgreSQL/clock/createDbClock.mjs'
import { lockedRow } from '@lib/PostgreSQL/lock/lockedRow.mjs'
import { expect } from 'chai'

import { RecordingTx } from '../../../helpers/recordingTx.mjs'

describe('lockedRow', () => {
	it('answers the row it was given and tells the clock that a lock was taken', async () => {
		const tx = new RecordingTx([{ ms: '1700000000123' }])
		const clock = createDbClock(tx, { write: true })
		const row = { id: 'x' }
		expect(await lockedRow(tx, row)).to.equal(row)
		expect(clock.now()).to.equal(1700000000123)
	})

	it('answers undefined for a statement that locked nothing, and tells the clock nothing', async () => {
		const tx = new RecordingTx([{ ms: '1700000000123' }])
		const clock = createDbClock(tx, { write: true })
		expect(await lockedRow(tx, undefined)).to.equal(undefined)
		expect(tx.calls).to.have.length(0)
		expect(() => clock.now()).to.throw('the clock of a write transaction is read after the first lock helper has returned')
	})

	it('counts a row that is falsy but present as a lock taken', async () => {
		for (const row of [0, '', false, null]) {
			const tx = new RecordingTx([{ ms: '5' }])
			const clock = createDbClock(tx, { write: true })
			expect(await lockedRow(tx, row)).to.equal(row)
			expect(clock.now()).to.equal(5)
		}
	})

	it('adds no statement when no clock is bound', async () => {
		const tx = new RecordingTx()
		await lockedRow(tx, { id: 'x' })
		expect(tx.calls).to.have.length(0)
	})
})
