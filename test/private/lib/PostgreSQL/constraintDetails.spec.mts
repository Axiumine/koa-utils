import { buildConstraintEntry } from '@lib/PostgreSQL/error/buildConstraintEntry.mjs'
import { constraintDetails } from '@private/lib/PostgreSQL/constraintDetails.mjs'
import { expect } from 'chai'

describe('constraintDetails', () => {
	it('answers undefined for a row without fixed details and without supplied keys', () => {
		expect(constraintDetails(buildConstraintEntry('EMAIL_TAKEN'), undefined)).to.equal(undefined)
		expect(constraintDetails(buildConstraintEntry('EMAIL_TAKEN'), { value: 'x' })).to.equal(undefined)
	})

	it('answers a copy of the fixed details for a row that has no supplied keys, even an empty object', () => {
		const fixed = { kind: 'sku' }
		const entry = buildConstraintEntry('DUPLICATE_ITEM', { fixed })
		const details = constraintDetails(entry, { kind: 'ignored' })
		expect(details).to.deep.equal({ kind: 'sku' })
		expect(details).to.not.equal(entry.fixed)
		expect(constraintDetails(buildConstraintEntry('INVALID', { fixed: {} }), undefined)).to.deep.equal({})
	})

	it('adds the supplied keys that the row lists, and no others', () => {
		const entry = buildConstraintEntry('DUPLICATE_ITEM', { fixed: { kind: 'sku' }, supplied: ['value'] })
		expect(constraintDetails(entry, { value: 'A-1', extra: 'x' })).to.deep.equal({ kind: 'sku', value: 'A-1' })
	})

	it('answers a row whose details are all supplied', () => {
		const entry = buildConstraintEntry('BIN_IN_USE', { supplied: ['orderIds'] })
		expect(constraintDetails(entry, { orderIds: ['o1'] })).to.deep.equal({ orderIds: ['o1'] })
	})

	it('answers null when the caller supplied nothing, or not the listed key', () => {
		const entry = buildConstraintEntry('BIN_IN_USE', { supplied: ['orderIds'] })
		expect(constraintDetails(entry, undefined)).to.equal(null)
		expect(constraintDetails(entry, {})).to.equal(null)
		expect(constraintDetails(entry, { other: 1 })).to.equal(null)
	})

	it('answers null for a key whose value is undefined, and keeps a value that is falsy', () => {
		const entry = buildConstraintEntry('BIN_IN_USE', { supplied: ['orderIds'] })
		expect(constraintDetails(entry, { orderIds: undefined })).to.equal(null)
		for (const value of [null, 0, false, '', []]) {
			expect(constraintDetails(entry, { orderIds: value }), JSON.stringify(value)).to.deep.equal({ orderIds: value })
		}
	})

	it('reads own keys only: an inherited key is missing', () => {
		const entry = buildConstraintEntry('BIN_IN_USE', { supplied: ['orderIds'] })
		const inherited = Object.create({ orderIds: ['o1'] }) as Record<string, unknown>
		expect(constraintDetails(entry, inherited)).to.equal(null)
	})

	it('answers null when one of several keys is missing, and stops at the first', () => {
		const entry = buildConstraintEntry('MULTI', { supplied: ['a', 'b', 'c'] })
		expect(constraintDetails(entry, { a: 1, c: 3 })).to.equal(null)
		expect(constraintDetails(entry, { a: 1, b: 2, c: 3 })).to.deep.equal({ a: 1, b: 2, c: 3 })
	})

	it('lets a supplied key win over a fixed key of the same name (the types forbid the overlap)', () => {
		const entry = buildConstraintEntry('MULTI', { fixed: { a: 'fixed' }, supplied: ['a'] })
		expect(constraintDetails(entry, { a: 'supplied' })).to.deep.equal({ a: 'supplied' })
	})

	it('treats a key named __proto__ as data: no prototype is set', () => {
		const entry = buildConstraintEntry('ODD', { supplied: ['__proto__'] })
		const given = JSON.parse('{"__proto__": {"polluted": true}}') as Record<string, unknown>
		const details = constraintDetails(entry, given)
		expect(details).to.not.equal(null)
		expect(Object.getPrototypeOf(details)).to.equal(Object.prototype)
		expect(Object.keys(details ?? {})).to.deep.equal(['__proto__'])
		expect(({} as { polluted?: boolean }).polluted).to.equal(undefined)
	})
})
