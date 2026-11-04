import { CLOCK_SQL } from '@lib/PostgreSQL/clock/CLOCK_SQL.mjs'
import { createDbClock } from '@lib/PostgreSQL/clock/createDbClock.mjs'
import type { IClock } from '@lib/PostgreSQL/clock/IClock.mjs'
import { DbClockError } from '@lib/PostgreSQL/error/DbClockError.mjs'
import { DbParseError } from '@lib/PostgreSQL/error/DbParseError.mjs'
import { expect } from 'chai'

import { failureOf, RecordingTx, thrownBy } from '../../../helpers/recordingTx.mjs'

const READ_ONLY = { write: false } as const

// 1 row answer: column ms as text
const ms = (text: string): unknown[] => [{ ms: text }]

describe('createDbClock: the port', () => {
	it('is a plain clock whose now() is a number, and has exactly now and read', async () => {
		const clock = createDbClock(new RecordingTx(ms('1767323045678')), READ_ONLY)
		const port: IClock = clock
		await clock.read()
		expect(typeof port.now()).to.equal('number')
		expect(Object.keys(clock).sort()).to.deep.equal(['now', 'read'])
		expect('isOverridden' in clock).to.equal(false)
	})
})

describe('createDbClock: one statement per transaction', () => {
	it('reads the database on the first read, with CLOCK_SQL and no parameter, and answers the same value afterwards', async () => {
		const tx = new RecordingTx(ms('1700000000123'), ms('1700000000999'))
		const clock = createDbClock(tx, READ_ONLY)
		expect(await clock.read()).to.equal(1700000000123)
		expect(clock.now()).to.equal(1700000000123)
		expect(clock.now()).to.equal(1700000000123)
		expect(await clock.read()).to.equal(1700000000123)
		expect(tx.calls).to.deep.equal([{ text: CLOCK_SQL, values: undefined }])
	})

	it('shares one statement between reads that start together', async () => {
		const tx = new RecordingTx(ms('1700000000123'), ms('1700000000999'))
		const clock = createDbClock(tx, READ_ONLY)
		const values = await Promise.all([clock.read(), clock.read(), clock.read()])
		expect(values).to.deep.equal([1700000000123, 1700000000123, 1700000000123])
		expect(tx.calls).to.have.length(1)
	})

	it('keeps the instant per transaction: another handle reads again', async () => {
		const first = createDbClock(new RecordingTx(ms('1700000000123')), READ_ONLY)
		const second = createDbClock(new RecordingTx(ms('1700000000456')), READ_ONLY)
		expect(await first.read()).to.equal(1700000000123)
		expect(await second.read()).to.equal(1700000000456)
		expect(first.now()).to.equal(1700000000123)
		expect(second.now()).to.equal(1700000000456)
	})

	it('does not retry a failed read: the failure is the answer of every later call', async () => {
		const boom = new Error('statement failed')
		const tx = new RecordingTx()
		tx.query = () => Promise.reject(boom)
		const clock = createDbClock(tx, READ_ONLY)
		expect(await failureOf(clock.read())).to.equal(boom)
		expect(await failureOf(clock.read())).to.equal(boom)
		expect(thrownBy(() => clock.now())).to.deep.include({ reason: 'NOT_READ' })
	})
})

describe('createDbClock: the int8 text becomes a number', () => {
	const OK: [string, number][] = [
		['0', 0],
		['1', 1],
		['-1', -1],
		['1767323045678', 1767323045678],
		['9007199254740991', Number.MAX_SAFE_INTEGER],
		['-9007199254740991', Number.MIN_SAFE_INTEGER]
	]
	for (const [text, expected] of OK) {
		it(`turns ${text} into the number ${String(expected)}`, async () => {
			const clock = createDbClock(new RecordingTx(ms(text)), READ_ONLY)
			expect(await clock.read()).to.equal(expected)
			expect(clock.now()).to.equal(expected)
		})
	}

	for (const text of ['9007199254740992', '-9007199254740992', '9223372036854775807', '-9223372036854775808']) {
		it(`refuses ${text} as not a safe integer, without the value in the message`, async () => {
			const clock = createDbClock(new RecordingTx(ms(text)), READ_ONLY)
			const error = (await failureOf(clock.read())) as DbClockError
			expect(error).to.be.instanceOf(DbClockError)
			expect(error.reason).to.equal('UNSAFE_INSTANT')
			expect(error.message).to.not.contain(text)
		})
	}

	for (const text of ['1.5', '1e3', '', ' 1', '+1', '01', 'abc']) {
		it(`refuses ${JSON.stringify(text)} by the shape rule of the int8 parser`, async () => {
			const clock = createDbClock(new RecordingTx(ms(text)), READ_ONLY)
			const error = (await failureOf(clock.read())) as DbParseError
			expect(error).to.be.instanceOf(DbParseError)
			expect(error.reason).to.equal('MALFORMED')
		})
	}

	it('refuses a value above the 64-bit range by the range rule of the int8 parser', async () => {
		const clock = createDbClock(new RecordingTx(ms('9223372036854775808')), READ_ONLY)
		const error = (await failureOf(clock.read())) as DbParseError
		expect(error).to.be.instanceOf(DbParseError)
		expect(error.reason).to.equal('OUT_OF_RANGE')
	})

	const BAD: [string, unknown[]][] = [
		['no row', []],
		['two rows', [{ ms: '1' }, { ms: '2' }]],
		['a number instead of the text', [{ ms: 1700000000123 }]],
		['a bigint instead of the text', [{ ms: 1700000000123n }]],
		['null', [{ ms: null }]],
		['a row without the column', [{}]]
	]
	for (const [name, rows] of BAD) {
		it(`refuses ${name} as BAD_RESULT and leaves now() unread`, async () => {
			const clock = createDbClock(new RecordingTx(rows), READ_ONLY)
			const error = (await failureOf(clock.read())) as DbClockError
			expect(error).to.be.instanceOf(DbClockError)
			expect(error.reason).to.equal('BAD_RESULT')
			expect(thrownBy(() => clock.now())).to.deep.include({ reason: 'NOT_READ' })
		})
	}
})
