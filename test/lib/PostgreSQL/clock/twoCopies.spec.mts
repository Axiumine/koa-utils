import { createDbClock } from '@lib/PostgreSQL/clock/createDbClock.mjs'
import { lockTaken } from '@lib/PostgreSQL/clock/lockTaken.mjs'
import { postgresState } from '@private/lib/PostgreSQL/postgresState.mjs'
import { expect } from 'chai'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { distClosure } from '../../../helpers/distClosure.mjs'
import { copyDistToTemp, type IIsolatedDist } from '../../../helpers/isolatedDist.mjs'
import { failureOf, RecordingTx } from '../../../helpers/recordingTx.mjs'

// 2 copies of package in 1 process, for real: built files copied to temp dir → own module instances, own functions.
// Same-file re-import would share cached deps → proves nothing. Here only globalThis registry can join them
const ENTRIES = [
	'lib/PostgreSQL/clock/createDbClock.mjs',
	'lib/PostgreSQL/clock/lockTaken.mjs',
	'private/lib/PostgreSQL/postgresState.mjs'
]
const STATE = 'private/lib/PostgreSQL/postgresState.mjs'
const LAYOUT = 'private/lib/PostgreSQL/POSTGRES_STATE_LAYOUT.mjs'

interface ICopy {
	createDbClock: typeof createDbClock
	lockTaken: typeof lockTaken
	postgresState: typeof postgresState
}

async function load(dist: IIsolatedDist): Promise<ICopy> {
	const [clock, taken, state] = (await Promise.all([
		import(dist.urlOf('lib/PostgreSQL/clock/createDbClock.mjs')),
		import(dist.urlOf('lib/PostgreSQL/clock/lockTaken.mjs')),
		import(dist.urlOf(STATE))
	])) as [Pick<ICopy, 'createDbClock'>, Pick<ICopy, 'lockTaken'>, Pick<ICopy, 'postgresState'>]
	return { ...clock, ...taken, ...state }
}

describe('two copies of the package in one process', () => {
	const copies: IIsolatedDist[] = []
	let other: ICopy

	before(async () => {
		const dist = copyDistToTemp(distClosure(ENTRIES))
		copies.push(dist)
		other = await load(dist)
	})

	after(() => {
		for (const dist of copies) dist.cleanup()
	})

	it('are separate code: the functions differ, the registry is the same object', () => {
		expect(other.createDbClock).to.not.equal(createDbClock)
		expect(other.lockTaken).to.not.equal(lockTaken)
		expect(other.postgresState).to.equal(postgresState)
	})

	it('lockTaken of the second copy reaches the clock that createDbClock of the first copy bound', async () => {
		const tx = new RecordingTx([{ ms: '1700000000123' }])
		const clock = createDbClock(tx, { write: true })
		await other.lockTaken(tx)
		expect(clock.now()).to.equal(1700000000123)
		expect(tx.calls).to.have.length(1)
	})

	it('lockTaken of the first copy reaches the clock that createDbClock of the second copy bound', async () => {
		const tx = new RecordingTx([{ ms: '1700000000456' }])
		const clock = other.createDbClock(tx, { write: true })
		await lockTaken(tx)
		expect(clock.now()).to.equal(1700000000456)
		expect(tx.calls).to.have.length(1)
	})

	it('the second copy sees the clock of the first as bound: one clock per transaction across copies', () => {
		const tx = new RecordingTx()
		createDbClock(tx, { write: false })
		expect(() => other.createDbClock(tx, { write: false })).to.throw('this transaction already has a clock')
	})

	it('a copy of another layout refuses to load, with the closed error, and the first copy keeps working', async () => {
		const dist = copyDistToTemp(distClosure(ENTRIES))
		copies.push(dist)
		writeFileSync(fileURLToPath(dist.urlOf(LAYOUT)), 'export const POSTGRES_STATE_LAYOUT = 2\n')
		const error = await failureOf(import(dist.urlOf(STATE)))
		expect(error).to.deep.include({ name: 'DbStateError', reason: 'LAYOUT_MISMATCH' })
		const tx = new RecordingTx([{ ms: '5' }])
		const clock = createDbClock(tx, { write: true })
		await lockTaken(tx)
		expect(clock.now()).to.equal(5)
	})
})
