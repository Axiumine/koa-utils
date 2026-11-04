import { guardVersion } from '@lib/PostgreSQL/guard/guardVersion.mjs'
import type { IVersionGuardInput } from '@lib/PostgreSQL/guard/IVersionGuardInput.mjs'
import { expect } from 'chai'

import { appErrors } from '../../../helpers/appErrors.mjs'
import { rejection } from '../../../helpers/fakeTxPool.mjs'
import { recordingLogger } from '../../../helpers/recordingLogger.mjs'
import { scriptedTx } from '../../../helpers/scriptedTx.mjs'

const GOOD = {
	reread: { text: 'SELECT 4 AS rev' },
	expected: 3,
	field: 'rev',
	entity: 'order',
	errors: appErrors,
	logger: recordingLogger().logger
} as const

describe('guardVersion: an input out of shape', () => {
	// each is a TypeError, thrown before any statement. cast: spec feed invalid input on purpose
	const bad: [string, Record<string, unknown>, string][] = [
		['a field that is not guarded', { field: 'status' }, 'field must be one of version, rev'],
		['a field that is a property of every object', { field: 'constructor' }, 'field must be one of version, rev'],
		['an empty field', { field: '' }, 'field must be one of version, rev'],
		['an expected value with a fraction', { expected: 1.5 }, 'expected must be a whole number'],
		['an expected value that is NaN', { expected: Number.NaN }, 'expected must be a whole number'],
		['an expected value that is text', { expected: '3' }, 'expected must be a whole number'],
		['an expected value beyond the safe range', { expected: 2 ** 53 }, 'expected must be a whole number'],
		['an empty entity', { entity: '' }, 'entity must be a non-empty string'],
		['an entity that is no text', { entity: 7 }, 'entity must be a non-empty string']
	]
	for (const [title, override, message] of bad) {
		it(`refuses ${title}, before any statement`, async () => {
			const { tx, calls } = scriptedTx([{ rows: [{ rev: 4 }] }])
			const failure = await rejection(guardVersion(tx, { ...GOOD, ...override } as unknown as IVersionGuardInput))
			expect(failure).to.be.instanceOf(TypeError)
			expect((failure as TypeError).message).to.equal(message)
			expect(calls).to.deep.equal([])
		})
	}

	it('checks the field first, then the expected value, then the entity', async () => {
		const { tx } = scriptedTx([])
		const all = { ...GOOD, field: 'x', expected: 1.5, entity: '' } as unknown as IVersionGuardInput
		expect(((await rejection(guardVersion(tx, all))) as Error).message).to.equal('field must be one of version, rev')
		const two = { ...GOOD, expected: 1.5, entity: '' }
		expect(((await rejection(guardVersion(tx, two))) as Error).message).to.equal('expected must be a whole number')
	})

	it('accepts a negative and a zero expected value: only a whole number is asked', async () => {
		for (const expected of [0, -1]) {
			const { tx } = scriptedTx([{ rows: [{ rev: 4 }] }])
			expect((await guardVersion(tx, { ...GOOD, expected })).code).to.equal('STALE_REV')
		}
	})
})
