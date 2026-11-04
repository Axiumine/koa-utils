import { CLOCK_SQL } from '@lib/PostgreSQL/clock/CLOCK_SQL.mjs'
import { createDbClock } from '@lib/PostgreSQL/clock/createDbClock.mjs'
import type { IDbClockOptions } from '@lib/PostgreSQL/clock/IDbClockOptions.mjs'
import { DbClockError } from '@lib/PostgreSQL/error/DbClockError.mjs'
import { expect } from 'chai'

import { RecordingTx, thrownBy } from '../../../helpers/recordingTx.mjs'

const SEAM_SQL = 'SELECT 1700000000123::bigint AS ms'
const ms = (text: string): unknown[] => [{ ms: text }]

// options from untyped caller: deliberately out of type
const loose = (value: unknown): IDbClockOptions => value as IDbClockOptions

describe('createDbClock: the seam', () => {
	it('runs the statement of the seam instead of CLOCK_SQL, with no parameter', async () => {
		const tx = new RecordingTx(ms('1767323045678'))
		const clock = createDbClock(tx, { write: false, seam: { statement: SEAM_SQL, allowed: true } })
		expect(await clock.read()).to.equal(1767323045678)
		expect(tx.calls).to.deep.equal([{ text: SEAM_SQL, values: undefined }])
		expect(tx.texts).to.not.contain(CLOCK_SQL)
	})

	it('is refused when it is not allowed, before any statement, with the fixed message', () => {
		const tx = new RecordingTx(ms('1'))
		const error = thrownBy(() =>
			createDbClock(tx, { write: false, seam: { statement: SEAM_SQL, allowed: false } })
		) as DbClockError
		expect(error).to.be.instanceOf(DbClockError)
		expect(error.reason).to.equal('SEAM_REFUSED')
		expect(error.message).to.equal('the test seam of the clock is not allowed here')
		expect(tx.calls).to.have.length(0)
	})

	it('leaves the handle free after a refusal: a later clock without the seam binds', () => {
		const tx = new RecordingTx(ms('1'))
		expect(() => createDbClock(tx, { write: false, seam: { statement: SEAM_SQL, allowed: false } })).to.throw(DbClockError)
		expect(() => createDbClock(tx, { write: false })).to.not.throw()
	})
})

describe('createDbClock: the checks and their order', () => {
	it('makes the choice of the transaction kind compulsory', () => {
		expect(() => createDbClock(new RecordingTx(), loose({}))).to.throw(TypeError, 'write must be a boolean')
		expect(() => createDbClock(new RecordingTx(), loose({ write: 'yes' }))).to.throw(TypeError, 'write must be a boolean')
		expect(() => createDbClock(new RecordingTx(), loose({ write: 1 }))).to.throw(TypeError, 'write must be a boolean')
	})

	it('refuses a seam out of its type, with a TypeError', () => {
		const tx = new RecordingTx()
		expect(() => createDbClock(tx, loose({ write: false, seam: 'select 1' }))).to.throw(TypeError, 'seam must be an object')
		expect(() => createDbClock(tx, loose({ write: false, seam: null }))).to.throw(TypeError, 'seam must be an object')
		expect(() => createDbClock(tx, loose({ write: false, seam: { allowed: true } }))).to.throw(
			TypeError,
			'seam.statement must be a non-empty string'
		)
		expect(() => createDbClock(tx, loose({ write: false, seam: { statement: '', allowed: true } }))).to.throw(
			TypeError,
			'seam.statement must be a non-empty string'
		)
		expect(() => createDbClock(tx, loose({ write: false, seam: { statement: SEAM_SQL } }))).to.throw(
			TypeError,
			'seam.allowed must be a boolean'
		)
		expect(() => createDbClock(tx, loose({ write: false, seam: { statement: SEAM_SQL, allowed: 'true' } }))).to.throw(
			TypeError,
			'seam.allowed must be a boolean'
		)
	})

	it('checks write first, then the seam, then ALREADY_BOUND', () => {
		const bound = new RecordingTx()
		createDbClock(bound, { write: false })
		const refused = { statement: SEAM_SQL, allowed: false }
		// write wrong beats a refused seam
		expect(() => createDbClock(bound, loose({ write: 'x', seam: refused }))).to.throw(TypeError, 'write must be a boolean')
		// seam out of type beats a refused seam and a bound handle
		expect(() => createDbClock(bound, loose({ write: false, seam: { statement: SEAM_SQL, allowed: 1 } }))).to.throw(
			TypeError,
			'seam.allowed must be a boolean'
		)
		// refused seam beats a bound handle
		expect((thrownBy(() => createDbClock(bound, { write: false, seam: refused })) as DbClockError).reason).to.equal(
			'SEAM_REFUSED'
		)
		// nothing wrong but the second clock
		expect((thrownBy(() => createDbClock(bound, { write: true })) as DbClockError).reason).to.equal('ALREADY_BOUND')
	})

	it('gives a transaction one clock and another handle its own', () => {
		const tx = new RecordingTx()
		createDbClock(tx, { write: false })
		const second = thrownBy(() => createDbClock(tx, { write: false })) as DbClockError
		expect(second.message).to.equal('this transaction already has a clock')
		expect(() => createDbClock(new RecordingTx(), { write: false })).to.not.throw()
	})
})
