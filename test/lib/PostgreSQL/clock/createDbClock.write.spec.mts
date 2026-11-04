import { CLOCK_SQL } from '@lib/PostgreSQL/clock/CLOCK_SQL.mjs'
import { createDbClock } from '@lib/PostgreSQL/clock/createDbClock.mjs'
import { lockTaken } from '@lib/PostgreSQL/clock/lockTaken.mjs'
import { DbClockError } from '@lib/PostgreSQL/error/DbClockError.mjs'
import { expect } from 'chai'

import { failureOf, RecordingTx, thrownBy } from '../../../helpers/recordingTx.mjs'

const ms = (text: string): unknown[] => [{ ms: text }]

describe('createDbClock: a read-only transaction', () => {
	it('reads before any lock was taken', async () => {
		const tx = new RecordingTx(ms('1700000000123'))
		const clock = createDbClock(tx, { write: false })
		expect(await clock.read()).to.equal(1700000000123)
		expect(tx.texts).to.deep.equal([CLOCK_SQL])
	})

	it('has no instant before the first read: now() cannot read the database', () => {
		const tx = new RecordingTx(ms('1700000000123'))
		const clock = createDbClock(tx, { write: false })
		const error = thrownBy(() => clock.now()) as DbClockError
		expect(error).to.be.instanceOf(DbClockError)
		expect(error.reason).to.equal('NOT_READ')
		expect(error.message).to.contain('await clock.read()')
		expect(tx.calls).to.have.length(0)
	})
})

describe('createDbClock: a write transaction', () => {
	it('refuses now() before a lock was taken, without a statement', () => {
		const tx = new RecordingTx(ms('1700000000123'))
		const clock = createDbClock(tx, { write: true })
		const error = thrownBy(() => clock.now()) as DbClockError
		expect(error).to.be.instanceOf(DbClockError)
		expect(error.reason).to.equal('WRITE_BEFORE_LOCK')
		expect(error).to.not.have.property('code')
		expect(tx.calls).to.have.length(0)
	})

	it('refuses read() before a lock was taken, without a statement', async () => {
		const tx = new RecordingTx(ms('1700000000123'))
		const clock = createDbClock(tx, { write: true })
		const error = (await failureOf(clock.read())) as DbClockError
		expect(error.reason).to.equal('WRITE_BEFORE_LOCK')
		expect(tx.calls).to.have.length(0)
	})

	it('gets its instant from the first lockTaken, after the lock statement, and reads it once', async () => {
		const tx = new RecordingTx([{ id: 'row' }], ms('1700000000123'), ms('1700000000999'))
		const clock = createDbClock(tx, { write: true })
		await tx.query('SELECT 1 FOR UPDATE')
		await lockTaken(tx)
		expect(tx.texts).to.deep.equal(['SELECT 1 FOR UPDATE', CLOCK_SQL])
		expect(clock.now()).to.equal(1700000000123)
		expect(clock.now()).to.equal(1700000000123)
		expect(await clock.read()).to.equal(1700000000123)
		await lockTaken(tx)
		expect(tx.calls).to.have.length(2)
	})

	it('may read after a lock taken before the clock was made: now() waits for the first read', async () => {
		const tx = new RecordingTx(ms('1700000000123'))
		await lockTaken(tx)
		const clock = createDbClock(tx, { write: true })
		expect((thrownBy(() => clock.now()) as DbClockError).reason).to.equal('NOT_READ')
		expect(await clock.read()).to.equal(1700000000123)
		expect(clock.now()).to.equal(1700000000123)
		expect(tx.texts).to.deep.equal([CLOCK_SQL])
	})

	it('says WRITE_BEFORE_LOCK for a now() when no helper took a lock (it locked nothing)', async () => {
		const tx = new RecordingTx(ms('1700000000123'))
		const clock = createDbClock(tx, { write: true })
		await tx.query('SELECT 1 FOR UPDATE')
		expect((thrownBy(() => clock.now()) as DbClockError).reason).to.equal('WRITE_BEFORE_LOCK')
		expect(tx.calls).to.have.length(1)
	})
})

describe('createDbClock: the default statement', () => {
	it('is CLOCK_SQL whether the seam is missing or undefined, and nothing else is sent', async () => {
		for (const options of [{ write: false }, { write: false, seam: undefined }]) {
			const tx = new RecordingTx(ms('5'))
			await createDbClock(tx, options).read()
			expect(tx.texts).to.deep.equal([CLOCK_SQL])
		}
	})
})
