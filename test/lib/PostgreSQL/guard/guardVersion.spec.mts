import { guardVersion } from '@lib/PostgreSQL/guard/guardVersion.mjs'
import type { IVersionGuardInput } from '@lib/PostgreSQL/guard/IVersionGuardInput.mjs'
import { expect } from 'chai'

import { type AppError } from '../../../helpers/appErrors.mjs'
import { payload, SECRET } from '../../../helpers/errorHarness.mjs'
import { driverError, leakText, rejection } from '../../../helpers/fakeTxPool.mjs'
import { recordingLogger } from '../../../helpers/recordingLogger.mjs'
import { scriptedTx, type TScriptedAnswer } from '../../../helpers/scriptedTx.mjs'
import { spiedErrors } from '../../../helpers/spiedErrors.mjs'

// input over a recorded logger + counter. overrides win. Values carry the planted secret → no result / log may show it
function guardSetup(overrides: Partial<IVersionGuardInput<AppError>> = {}) {
	const log = recordingLogger()
	const counts: string[] = []
	const spied = spiedErrors()
	const input: IVersionGuardInput<AppError> = {
		reread: {
			text: 'SELECT p.rev FROM app.orders p WHERE p.id = $1 AND p.group_id IN (SELECT group_id FROM app.memberships WHERE user_id = $2)',
			values: ['order-1', SECRET]
		},
		expected: 3,
		field: 'rev',
		entity: 'order',
		errors: spied.errors,
		logger: log.logger,
		counter: (name) => void counts.push(name),
		...overrides
	}
	return { log, counts, spied, input }
}

describe('guardVersion', () => {
	it('runs the statement it is given, once, with its values, and nothing else', async () => {
		const { tx, calls } = scriptedTx([{ rows: [{ rev: 4 }] }])
		const { input } = guardSetup()
		await guardVersion(tx, input)
		expect(calls).to.deep.equal([{ text: input.reread.text, values: input.reread.values, argc: 2 }])
	})

	it('answers NOT_FOUND with the entity when the re-read finds no row (absent, or not visible to the actor)', async () => {
		const { tx } = scriptedTx([{ rows: [] }])
		const { input, counts, log, spied } = guardSetup()
		const error = await guardVersion(tx, input)
		expect(payload(error)).to.deep.equal({ code: 'NOT_FOUND', details: { entity: 'order' } })
		expect(spied.make.firstCall.args).to.deep.equal(['NOT_FOUND', { entity: 'order' }])
		expect(spied.internal.callCount).to.equal(0)
		expect(counts).to.deep.equal([])
		expect(log.calls).to.deep.equal([])
	})

	it('answers the same NOT_FOUND for an absent row and for a row the actor may not see', async () => {
		// both = one result of the same statement: no row. Answer cannot tell them apart
		const absent = await guardVersion(scriptedTx([{ rows: [] }]).tx, guardSetup({ expected: 1 }).input)
		const hidden = await guardVersion(scriptedTx([{ rows: [] }]).tx, guardSetup({ expected: 99 }).input)
		expect(payload(absent)).to.deep.equal(payload(hidden))
		expect(absent.message).to.equal(hidden.message)
	})

	it('answers STALE_REV for field rev and STALE_VERSION for field version when the row is visible with another value', async () => {
		const rev = guardSetup()
		const staleRev = await guardVersion(scriptedTx([{ rows: [{ rev: 4 }] }]).tx, rev.input)
		expect(payload(staleRev)).to.deep.equal({ code: 'STALE_REV' })
		expect(rev.spied.make.firstCall.args).to.deep.equal(['STALE_REV'])

		const version = guardSetup({ field: 'version', expected: 3, entity: 'membership' })
		const staleVersion = await guardVersion(scriptedTx([{ rows: [{ version: 2 }] }]).tx, version.input)
		expect(payload(staleVersion)).to.deep.equal({ code: 'STALE_VERSION' })
		expect(version.spied.make.firstCall.args).to.deep.equal(['STALE_VERSION'])
	})

	it('answers a stale code for a version below as well as above the expected one', async () => {
		for (const current of [1, 2, 4, 1000]) {
			const error = await guardVersion(scriptedTx([{ rows: [{ rev: current }] }]).tx, guardSetup().input)
			expect(error.code, String(current)).to.equal('STALE_REV')
		}
	})

	it('reads a bigint version, which the pool hands over as a decimal string', async () => {
		const stale = await guardVersion(
			scriptedTx([{ rows: [{ version: '9007199254740993' }] }]).tx,
			guardSetup({ field: 'version', expected: 3 }).input
		)
		expect(stale.code).to.equal('STALE_VERSION')
		const same = await guardVersion(
			scriptedTx([{ rows: [{ version: '3' }] }]).tx,
			guardSetup({ field: 'version', expected: 3 }).input
		)
		expect(payload(same)).to.deep.equal({ code: 'INTERNAL', details: { reason: 'VERSION_UNCHANGED' } })
	})

	it('answers the internal error (VERSION_UNCHANGED) with a log line and a counter when the visible row still has the expected version', async () => {
		const { tx } = scriptedTx([{ rows: [{ rev: 3 }] }])
		const { input, log, counts, spied } = guardSetup()
		const error = await guardVersion(tx, input)
		expect(payload(error)).to.deep.equal({ code: 'INTERNAL', details: { reason: 'VERSION_UNCHANGED' } })
		expect(spied.internal.firstCall.args).to.deep.equal(['VERSION_UNCHANGED'])
		expect(spied.make.callCount).to.equal(0)
		expect(counts).to.deep.equal(['db_error_internal_total'])
		expect(log.calls).to.have.length(1)
		expect(log.calls[0]?.level).to.equal('error')
		expect(log.calls[0]?.message).to.equal('version guard cannot decide')
		expect(log.calls[0]?.fields).to.deep.equal({ reason: 'VERSION_UNCHANGED', field: 'rev', entity: 'order' })
	})

	describe('answers the internal error (REREAD_UNREADABLE) for', () => {
		const bad: [string, TScriptedAnswer][] = [
			['more than one row', { rows: [{ rev: 4 }, { rev: 5 }] }],
			['a missing column', { rows: [{ other: 4 }] }],
			['a null version', { rows: [{ rev: null }] }],
			['a version that is text but no number', { rows: [{ rev: 'four' }] }],
			['a fraction', { rows: [{ rev: 1.5 }] }],
			['an integer beyond the safe range', { rows: [{ rev: 2 ** 60 }] }],
			['a decimal string of 20 digits', { rows: [{ rev: '12345678901234567890' }] }],
			['a column other than the guarded one', { rows: [{ version: 4 }] }],
			['a decimal string with a sign', { rows: [{ rev: '-4' }] }],
			['a decimal string with a space', { rows: [{ rev: '4 ' }] }],
			['an empty string', { rows: [{ rev: '' }] }]
		]
		for (const [title, answer] of bad) {
			it(title, async () => {
				const { input, counts, log } = guardSetup()
				const error = await guardVersion(scriptedTx([answer]).tx, input)
				expect(payload(error)).to.deep.equal({ code: 'INTERNAL', details: { reason: 'REREAD_UNREADABLE' } })
				expect(counts).to.deep.equal(['db_error_internal_total'])
				expect(log.calls[0]?.fields).to.deep.equal({ reason: 'REREAD_UNREADABLE', field: 'rev', entity: 'order' })
			})
		}
	})

	it('accepts a decimal string of 1 and of 19 digits', async () => {
		const one = await guardVersion(scriptedTx([{ rows: [{ rev: '4' }] }]).tx, guardSetup().input)
		expect(one.code).to.equal('STALE_REV')
		const nineteen = await guardVersion(scriptedTx([{ rows: [{ rev: '1234567890123456789' }] }]).tx, guardSetup().input)
		expect(nineteen.code).to.equal('STALE_REV')
	})

	it('works without a counter', async () => {
		const { input } = guardSetup()
		const { counter: _unused, ...withoutCounter } = input
		void _unused
		const error = await guardVersion(scriptedTx([{ rows: [{ rev: 3 }] }]).tx, withoutCounter)
		expect(error.code).to.equal('INTERNAL')
	})

	it('works with a factory that has make and internal and nothing else', async () => {
		const { input } = guardSetup()
		const errors = { make: input.errors.make, internal: input.errors.internal }
		const error = await guardVersion(scriptedTx([{ rows: [] }]).tx, { ...input, errors })
		expect(error.code).to.equal('NOT_FOUND')
	})

	it('works without values, and then the handle is called with the text only', async () => {
		const { tx, calls } = scriptedTx([{ rows: [{ rev: 4 }] }])
		const { input } = guardSetup({ reread: { text: 'SELECT 4 AS rev' } })
		await guardVersion(tx, input)
		expect(calls).to.deep.equal([{ text: 'SELECT 4 AS rev', values: undefined, argc: 2 }])
	})

	it('throws the failure of the re-read unchanged, for mapDbError or withTx to classify', async () => {
		const failure = driverError('57014', 'canceling statement due to statement timeout')
		const { input, log, counts } = guardSetup()
		expect(await rejection(guardVersion(scriptedTx([failure]).tx, input))).to.equal(failure)
		expect(log.calls).to.deep.equal([])
		expect(counts).to.deep.equal([])
	})

	it('returns and logs nothing of the values of the statement: a planted secret parameter is in no result and no line', async () => {
		const answers: TScriptedAnswer[] = [{ rows: [] }, { rows: [{ rev: 4 }] }, { rows: [{ rev: 3 }] }, { rows: [{ other: 1 }] }]
		for (const answer of answers) {
			const setup = guardSetup()
			const error = await guardVersion(scriptedTx([answer]).tx, setup.input)
			const everything = leakText(error, setup.log.calls)
			expect(everything, JSON.stringify(answer)).to.not.contain(SECRET)
			expect(everything).to.not.contain('SELECT')
			expect(everything).to.not.contain('app.orders')
		}
	})
})
