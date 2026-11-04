import { buildConstraintEntry } from '@lib/PostgreSQL/error/buildConstraintEntry.mjs'
import { mapDbError } from '@lib/PostgreSQL/error/mapDbError.mjs'
import { expect } from 'chai'

import { fieldsOf, mapSetup, payload, violation } from '../../../helpers/errorHarness.mjs'

describe('mapDbError: the details that the caller supplies', () => {
	it('copies the listed keys and no others', () => {
		const { options } = mapSetup({ details: { value: '20:30', extra: 'x', kind: 'bin' } })
		const error = mapDbError(violation('23505', 'order_items_order_id_slot_uq'), options)
		expect(payload(error)).to.deep.equal({ code: 'DUPLICATE_ITEM', details: { kind: 'slot', value: '20:30' } })
	})

	it('ignores details for a row that lists none', () => {
		const { options } = mapSetup({ details: { value: 'x', field: 'email' } })
		expect(payload(mapDbError(violation('23505', 'customers_email_uq'), options))).to.deep.equal({ code: 'EMAIL_TAKEN' })
	})

	it('answers the internal error (DETAILS_NOT_SUPPLIED) with the name logged when a listed key is missing', () => {
		const inherited = Object.create({ value: 'inherited' }) as Record<string, unknown>
		for (const details of [undefined, {}, { other: 'x' }, { value: undefined }, inherited]) {
			const { log, counts, options } = mapSetup(details === undefined ? {} : { details })
			const error = mapDbError(violation('23505', 'order_items_order_id_sku_uq'), options)
			expect(payload(error)).to.deep.equal({ code: 'INTERNAL', details: { reason: 'DETAILS_NOT_SUPPLIED' } })
			expect(counts).to.deep.equal(['db_error_internal_total'])
			expect(log.calls).to.have.length(1)
			expect(log.calls[0]?.level).to.equal('error')
			expect(log.calls[0]?.message).to.equal('database constraint violation needs details that the caller did not supply')
			expect(fieldsOf(log.calls)).to.deep.equal({
				reason: 'DETAILS_NOT_SUPPLIED',
				sqlstate: '23505',
				constraint: 'order_items_order_id_sku_uq'
			})
		}
	})

	it('supports a row whose details are all supplied and a row of fixed details only', () => {
		const table = Object.freeze({
			bin_fk: buildConstraintEntry('BIN_IN_USE', { supplied: ['orderIds'] }),
			id_pk: buildConstraintEntry('INVALID', { fixed: { field: 'id' } })
		})
		const { options } = mapSetup({ table, details: { orderIds: ['o1', 'o2'] } })
		expect(payload(mapDbError(violation('23503', 'bin_fk'), options))).to.deep.equal({
			code: 'BIN_IN_USE',
			details: { orderIds: ['o1', 'o2'] }
		})
		expect(payload(mapDbError(violation('23505', 'id_pk'), options))).to.deep.equal({
			code: 'INVALID',
			details: { field: 'id' }
		})
	})

	it('keeps an empty array, false, zero and null that the caller supplied (only undefined is missing)', () => {
		const table = Object.freeze({ bin_fk: buildConstraintEntry('BIN_IN_USE', { supplied: ['orderIds'] }) })
		for (const value of [[], false, 0, null, '']) {
			const { options } = mapSetup({ table, details: { orderIds: value } })
			expect(payload(mapDbError(violation('23503', 'bin_fk'), options)), String(value)).to.deep.equal({
				code: 'BIN_IN_USE',
				details: { orderIds: value }
			})
		}
	})

	it('copies the supplied keys when a row lists several, in the order of the row', () => {
		const table = Object.freeze({ multi: buildConstraintEntry('MULTI', { fixed: { a: 1 }, supplied: ['b', 'c'] }) })
		const { options } = mapSetup({ table, details: { c: 3, b: 2 } })
		const error = mapDbError(violation('23505', 'multi'), options)
		expect(payload(error)).to.deep.equal({ code: 'MULTI', details: { a: 1, b: 2, c: 3 } })
		expect(Object.keys(error.details as object)).to.deep.equal(['a', 'b', 'c'])
	})

	it('answers the internal error when one of several listed keys is missing', () => {
		const table = Object.freeze({ multi: buildConstraintEntry('MULTI', { supplied: ['b', 'c'] }) })
		const { options } = mapSetup({ table, details: { b: 2 } })
		expect(payload(mapDbError(violation('23505', 'multi'), options)).details).to.deep.equal({ reason: 'DETAILS_NOT_SUPPLIED' })
	})
})
