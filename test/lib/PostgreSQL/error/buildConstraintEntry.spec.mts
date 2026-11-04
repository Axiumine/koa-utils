import { buildConstraintEntry } from '@lib/PostgreSQL/error/buildConstraintEntry.mjs'
import { expect } from 'chai'

describe('buildConstraintEntry', () => {
	it('builds a row for a code with no details, frozen', () => {
		const entry = buildConstraintEntry('EMAIL_TAKEN')
		expect(entry).to.deep.equal({ code: 'EMAIL_TAKEN' })
		expect(Object.isFrozen(entry)).to.equal(true)
		// keys absent, not undefined → `'fixed' in row` tell truth
		expect(Object.keys(entry)).to.deep.equal(['code'])
	})

	it('builds a row whose details the caller supplies', () => {
		const entry = buildConstraintEntry('BIN_IN_USE', { supplied: ['orderIds'] })
		expect(entry).to.deep.equal({ code: 'BIN_IN_USE', supplied: ['orderIds'] })
		expect(Object.keys(entry)).to.deep.equal(['code', 'supplied'])
	})

	it('builds a row whose details the constraint fixes', () => {
		const entry = buildConstraintEntry('INVALID', { fixed: { field: 'id' } })
		expect(entry).to.deep.equal({ code: 'INVALID', fixed: { field: 'id' } })
		expect(Object.keys(entry)).to.deep.equal(['code', 'fixed'])
	})

	it('builds a row with both, fixed first', () => {
		const entry = buildConstraintEntry('DUPLICATE_ITEM', { fixed: { kind: 'sku' }, supplied: ['value'] })
		expect(entry).to.deep.equal({ code: 'DUPLICATE_ITEM', fixed: { kind: 'sku' }, supplied: ['value'] })
	})

	it('freezes the row, its fixed details and its supplied list', () => {
		const entry = buildConstraintEntry('DUPLICATE_ITEM', { fixed: { kind: 'sku' }, supplied: ['value'] })
		expect(Object.isFrozen(entry)).to.equal(true)
		expect(Object.isFrozen(entry.fixed)).to.equal(true)
		expect(Object.isFrozen(entry.supplied)).to.equal(true)
	})

	it('copies fixed and supplied, so the arguments are not shared with the row', () => {
		const fixed = { kind: 'sku' }
		const supplied = ['value']
		const entry = buildConstraintEntry('DUPLICATE_ITEM', { fixed, supplied })
		expect(entry.fixed).to.not.equal(fixed)
		expect(entry.supplied).to.not.equal(supplied)
		// caller mutates its own objects later → row unchanged
		fixed.kind = 'slot'
		supplied.push('other')
		expect(entry.fixed).to.deep.equal({ kind: 'sku' })
		expect(entry.supplied).to.deep.equal(['value'])
	})

	it('drops an empty supplied list, and keeps an empty fixed object', () => {
		expect(buildConstraintEntry('BIN_FREE', { supplied: [] })).to.deep.equal({ code: 'BIN_FREE' })
		expect(Object.keys(buildConstraintEntry('BIN_FREE', { supplied: [] }))).to.deep.equal(['code'])
		expect(buildConstraintEntry('INVALID', { fixed: {} })).to.deep.equal({ code: 'INVALID', fixed: {} })
	})

	it('turns every supplied key into a string, so a symbol or number key is a plain name', () => {
		const entry = buildConstraintEntry('BIN_IN_USE', { supplied: [1, 'two'] })
		expect(entry.supplied).to.deep.equal(['1', 'two'])
	})
})
