import { CLOCK_SQL } from '@lib/PostgreSQL/clock/CLOCK_SQL.mjs'
import { createDbClock } from '@lib/PostgreSQL/clock/createDbClock.mjs'
import { lockedRow } from '@lib/PostgreSQL/lock/lockedRow.mjs'
import { lockedRows } from '@lib/PostgreSQL/lock/lockedRows.mjs'
import { rowLockModeOf } from '@lib/PostgreSQL/lock/rowLockModeOf.mjs'
import { uuidOf } from '@lib/PostgreSQL/lock/uuidOf.mjs'
import { uuidsOf } from '@lib/PostgreSQL/lock/uuidsOf.mjs'
import type { IRowLockMode } from '@lib/PostgreSQL/lock/IRowLockMode.mjs'
import type { ITx } from '@lib/PostgreSQL/tx/ITx.mjs'
import { expect } from 'chai'

import { failureOf, RecordingTx } from '../../../helpers/recordingTx.mjs'
import { toyTracker } from '../../../helpers/toyLockSpec.mjs'

// lock helpers written the way docs/code/lib-postgres.md shows: validate, admit, statement, record, hold, tell clock.
// Toy tables, no product schema. The kit ships the parts, the helper (SQL + order) is the app's

interface IRow {
	readonly id: string
}

const ALPHA = 'SELECT id FROM toy.alpha WHERE id = $1 FOR UPDATE'
const BETA_UPDATE = 'SELECT id FROM toy.beta WHERE id = $1 FOR UPDATE'
const BETA_SHARE = 'SELECT id FROM toy.beta WHERE id = $1 FOR SHARE'
const GAMMA_TRY = 'SELECT id FROM toy.gamma WHERE id = $1 FOR UPDATE SKIP LOCKED'
const GAMMAS = 'SELECT id FROM toy.gamma WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE'

const tracker = toyTracker()

// rank recorded before statement: asking for the lock is the order violation, even if no row comes back
async function takeAlpha(tx: ITx, id: string): Promise<IRow | undefined> {
	const alphaId = uuidOf(id, 'alphaId')
	tracker.record(tx, tracker.admit(tx, 'takeAlpha'))
	const { rows } = await tx.query<IRow>(ALPHA, [alphaId])
	const row = rows[0]
	if (row !== undefined) tracker.hold(tx, 'alpha', 2)
	return lockedRow(tx, row)
}

async function takeBeta(tx: ITx, id: string, mode: IRowLockMode): Promise<IRow | undefined> {
	const betaId = uuidOf(id, 'betaId')
	const statement = rowLockModeOf(mode) === 'update' ? BETA_UPDATE : BETA_SHARE
	tracker.record(tx, tracker.admit(tx, 'takeBeta'))
	const { rows } = await tx.query<IRow>(statement, [betaId])
	return lockedRow(tx, rows[0])
}

// try-lock: rank checked before, recorded only when the row came back
async function tryTakeGamma(tx: ITx, id: string): Promise<IRow | undefined> {
	const gammaId = uuidOf(id, 'gammaId')
	const admission = tracker.admit(tx, 'takeGamma')
	const { rows } = await tx.query<IRow>(GAMMA_TRY, [gammaId])
	const row = rows[0]
	if (row !== undefined) tracker.record(tx, admission)
	return lockedRow(tx, row)
}

async function takeGammas(tx: ITx, ids: readonly string[]): Promise<IRow[]> {
	const gammaIds = uuidsOf(ids, 'gammaIds')
	tracker.record(tx, tracker.admit(tx, 'takeGamma'))
	if (gammaIds.length === 0) return []
	const { rows } = await tx.query<IRow>(GAMMAS, [gammaIds])
	return lockedRows(tx, rows)
}

const A = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
const B = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c'
const ROW = { id: A }
const INSTANT = [{ ms: '1700000000123' }]

describe('lock helpers built from the parts: with a clock', () => {
	it('reads the instant right after the lock statement, once, and now() is ready', async () => {
		const tx = new RecordingTx([ROW], INSTANT, [{ ms: '1700000000999' }])
		const clock = createDbClock(tx, { write: true })
		await takeAlpha(tx, A.toUpperCase())
		await takeBeta(tx, B, 'share')
		expect(tx.calls).to.deep.equal([
			{ text: ALPHA, values: [A] },
			{ text: CLOCK_SQL, values: undefined },
			{ text: BETA_SHARE, values: [B] }
		])
		expect(clock.now()).to.equal(1700000000123)
	})

	it('adds no statement to a transaction without a clock', async () => {
		const tx = new RecordingTx([ROW])
		await takeAlpha(tx, A)
		expect(tx.texts).to.deep.equal([ALPHA])
	})

	it('does not tell the clock when the statement locked nothing, so a write clock still refuses', async () => {
		const tx = new RecordingTx([], INSTANT)
		const clock = createDbClock(tx, { write: true })
		expect(await takeAlpha(tx, A)).to.equal(undefined)
		expect(() => clock.now()).to.throw('before')
		expect(tx.texts).to.deep.equal([ALPHA])
	})

	it('tells the clock for a list of rows only when the list is not empty', async () => {
		const tx = new RecordingTx([ROW, { id: B }], INSTANT)
		const clock = createDbClock(tx, { write: true })
		expect(await takeGammas(tx, [B, A, A])).to.deep.equal([ROW, { id: B }])
		expect(tx.calls[0]).to.deep.equal({ text: GAMMAS, values: [[A, B]] })
		expect(clock.now()).to.equal(1700000000123)
		expect(await takeGammas(new RecordingTx(), [])).to.deep.equal([])
	})
})

describe('lock helpers built from the parts: the order', () => {
	it('refuses a lower rank after a higher one, before the statement', async () => {
		const tx = new RecordingTx([ROW], [ROW])
		await takeBeta(tx, B, 'update')
		const error = await failureOf(takeAlpha(tx, A))
		expect(error).to.have.property('reason', 'RANK_INVERSION')
		expect(tx.calls).to.have.length(1)
	})

	it('records the rank of a plain helper even when no row came back', async () => {
		const tx = new RecordingTx([])
		await takeBeta(tx, B, 'update')
		expect(await failureOf(takeAlpha(tx, A))).to.have.property('reason', 'RANK_INVERSION')
	})

	it('records the rank of a try-lock only when the row came back', async () => {
		const none = new RecordingTx([])
		await tryTakeGamma(none, A)
		expect(await takeAlpha(none, A)).to.equal(undefined)
		const taken = new RecordingTx([ROW])
		await tryTakeGamma(taken, A)
		expect(await failureOf(takeAlpha(taken, A))).to.have.property('reason', 'RANK_INVERSION')
	})

	it('checks the rank of a try-lock before its statement', async () => {
		const tx = new RecordingTx([ROW])
		await takeAlpha(tx, A)
		tracker.record(tx, tracker.admit(tx, 'takeZeta'))
		const error = await failureOf(tryTakeGamma(tx, A))
		expect(error).to.have.property('reason', 'RANK_INVERSION')
		expect(tx.calls).to.have.length(1)
	})

	it('holds what the helper chose, readable by a later check', async () => {
		const tx = new RecordingTx([ROW])
		expect(tracker.held(tx, 'alpha')).to.equal(0)
		await takeAlpha(tx, A)
		expect(tracker.held(tx, 'alpha')).to.equal(2)
	})
})

describe('lock helpers built from the parts: the arguments', () => {
	it('refuse a wrong id, a wrong mode and a wrong list as TypeError, before the tracker and the statement', async () => {
		const tx = new RecordingTx([ROW])
		expect(await failureOf(takeAlpha(tx, 'not-a-uuid'))).to.have.property('message', 'alphaId must be a UUID')
		const mode = 'exclusive' as unknown as IRowLockMode
		expect(await failureOf(takeBeta(tx, B, mode))).to.have.property('message', 'mode must be one of update, share')
		expect(await failureOf(takeGammas(tx, 'x' as unknown as string[]))).to.have.property(
			'message',
			'gammaIds must be an array of UUIDs'
		)
		expect(tx.calls).to.have.length(0)
		// tracker untouched: top rank still free
		expect(tracker.admit(tx, 'takeAlpha')).to.deep.equal({ rank: 1 })
	})
})
