import { CLAIM_LIMIT_MAX } from '@lib/PostgreSQL/lock/CLAIM_LIMIT_MAX.mjs'
import { claimRowsSkipLocked } from '@lib/PostgreSQL/lock/claimRowsSkipLocked.mjs'
import type { IClaimRegistry } from '@lib/PostgreSQL/lock/IClaimRegistry.mjs'
import { createDbClock } from '@lib/PostgreSQL/clock/createDbClock.mjs'
import { expect } from 'chai'

import { failureOf, RecordingTx } from '../../../helpers/recordingTx.mjs'

// registry of the caller: 2 tables, 2 predicates on first. Statement text is the caller's, opaque to the kit
const CLAIMS = {
	jobs: {
		ready: 'SELECT id, kind FROM app.jobs WHERE done_at IS NULL ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED',
		stale: 'SELECT id, kind FROM app.jobs WHERE seen_at < now() ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED'
	},
	mails: {
		pending: 'SELECT id FROM app.mails WHERE sent_at IS NULL ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED'
	}
} as const satisfies IClaimRegistry

const ROW = { id: 'a', kind: 'k' }

describe('claimRowsSkipLocked: the statement', () => {
	it('runs the statement of the table and predicate, with the limit as the one parameter, and answers the rows', async () => {
		const tx = new RecordingTx([ROW])
		const rows = await claimRowsSkipLocked<typeof ROW>(tx, CLAIMS, { table: 'jobs', predicate: 'ready', limit: 25 })
		expect(rows).to.deep.equal([ROW])
		expect(tx.calls).to.deep.equal([{ text: CLAIMS.jobs.ready, values: [25] }])
	})

	it('picks by both names', async () => {
		const stale = new RecordingTx([])
		await claimRowsSkipLocked(stale, CLAIMS, { table: 'jobs', predicate: 'stale', limit: 1 })
		expect(stale.texts).to.deep.equal([CLAIMS.jobs.stale])
		const mails = new RecordingTx([])
		await claimRowsSkipLocked(mails, CLAIMS, { table: 'mails', predicate: 'pending', limit: 1 })
		expect(mails.texts).to.deep.equal([CLAIMS.mails.pending])
	})

	it('accepts the limit at both edges', async () => {
		for (const limit of [1, CLAIM_LIMIT_MAX]) {
			const tx = new RecordingTx([])
			await claimRowsSkipLocked(tx, CLAIMS, { table: 'jobs', predicate: 'ready', limit })
			expect(tx.calls[0]?.values).to.deep.equal([limit])
		}
	})

	it('answers an empty list when nothing was claimed', async () => {
		expect(
			await claimRowsSkipLocked(new RecordingTx([]), CLAIMS, { table: 'jobs', predicate: 'ready', limit: 3 })
		).to.deep.equal([])
	})

	it('lets a failure of the statement through unchanged', async () => {
		const boom = new Error('statement failed')
		const tx = new RecordingTx()
		tx.query = () => Promise.reject(boom)
		expect(await failureOf(claimRowsSkipLocked(tx, CLAIMS, { table: 'jobs', predicate: 'ready', limit: 3 }))).to.equal(boom)
	})
})

describe('claimRowsSkipLocked: the checks, before any statement', () => {
	async function refusal(claims: IClaimRegistry, request: { table: string; predicate: string; limit: number }): Promise<string> {
		const tx = new RecordingTx([ROW])
		const error = await failureOf(claimRowsSkipLocked(tx, claims, request))
		expect(error).to.be.instanceOf(TypeError)
		expect(tx.calls).to.have.length(0)
		return (error as TypeError).message
	}

	it('refuses a table that is not an own key of the registry, also for names every object has', async () => {
		for (const table of ['users', '', 'JOBS', 'toString', '__proto__', 'constructor', 'hasOwnProperty']) {
			expect(await refusal(CLAIMS, { table, predicate: 'ready', limit: 1 })).to.equal(
				'table is not in the closed list of claim tables'
			)
		}
	})

	it('refuses a predicate that is not an own key of the table, and names the table', async () => {
		for (const predicate of ['other', '', 'READY', 'toString', '__proto__', 'constructor']) {
			expect(await refusal(CLAIMS, { table: 'jobs', predicate, limit: 1 })).to.equal(
				'predicate is not in the closed list of jobs'
			)
		}
		expect(await refusal(CLAIMS, { table: 'mails', predicate: 'ready', limit: 1 })).to.equal(
			'predicate is not in the closed list of mails'
		)
	})

	it('refuses a limit that is not a whole number from 1 to CLAIM_LIMIT_MAX', async () => {
		for (const limit of [0, -1, 1.5, CLAIM_LIMIT_MAX + 1, Number.NaN, Infinity, '5' as unknown as number, 1e9]) {
			expect(await refusal(CLAIMS, { table: 'jobs', predicate: 'ready', limit })).to.equal(
				'limit must be a whole number from 1 to 1000'
			)
		}
	})

	it('checks the table, then the predicate, then the limit', async () => {
		expect(await refusal(CLAIMS, { table: 'nope', predicate: 'nope', limit: 0 })).to.equal(
			'table is not in the closed list of claim tables'
		)
		expect(await refusal(CLAIMS, { table: 'jobs', predicate: 'nope', limit: 0 })).to.equal(
			'predicate is not in the closed list of jobs'
		)
	})

	it('reads the registry given at the call, not a built-in one: an empty registry refuses every table', async () => {
		expect(await refusal({}, { table: 'jobs', predicate: 'ready', limit: 1 })).to.equal(
			'table is not in the closed list of claim tables'
		)
	})
})

describe('claimRowsSkipLocked: the clock', () => {
	it('tells a bound clock after a claim that took rows, and a claim is no rank', async () => {
		const tx = new RecordingTx([ROW], [{ ms: '1700000000123' }])
		const clock = createDbClock(tx, { write: true })
		await claimRowsSkipLocked(tx, CLAIMS, { table: 'jobs', predicate: 'ready', limit: 1 })
		expect(tx.calls).to.have.length(2)
		expect(clock.now()).to.equal(1700000000123)
	})

	it('tells the clock nothing after a claim that took no row', async () => {
		const tx = new RecordingTx([], [{ ms: '1700000000123' }])
		createDbClock(tx, { write: true })
		await claimRowsSkipLocked(tx, CLAIMS, { table: 'jobs', predicate: 'ready', limit: 1 })
		expect(tx.calls).to.have.length(1)
	})
})
