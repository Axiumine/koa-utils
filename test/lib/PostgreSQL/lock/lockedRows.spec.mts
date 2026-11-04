import { createDbClock } from '@lib/PostgreSQL/clock/createDbClock.mjs'
import { lockedRows } from '@lib/PostgreSQL/lock/lockedRows.mjs'
import { expect } from 'chai'

import { RecordingTx } from '../../../helpers/recordingTx.mjs'

describe('lockedRows', () => {
	it('answers the list it was given and tells the clock that a lock was taken', async () => {
		const tx = new RecordingTx([{ ms: '1700000000123' }])
		const clock = createDbClock(tx, { write: true })
		const rows = [{ id: 'a' }, { id: 'b' }]
		expect(await lockedRows(tx, rows)).to.equal(rows)
		expect(clock.now()).to.equal(1700000000123)
		expect(tx.calls).to.have.length(1)
	})

	it('counts a list of one row as a lock taken', async () => {
		const tx = new RecordingTx([{ ms: '9' }])
		const clock = createDbClock(tx, { write: true })
		await lockedRows(tx, [{ id: 'a' }])
		expect(clock.now()).to.equal(9)
	})

	it('answers an empty list for an empty list, and tells the clock nothing', async () => {
		const tx = new RecordingTx([{ ms: '1700000000123' }])
		const clock = createDbClock(tx, { write: true })
		const rows: unknown[] = []
		expect(await lockedRows(tx, rows)).to.equal(rows)
		expect(tx.calls).to.have.length(0)
		expect(() => clock.now()).to.throw('before')
	})
})
