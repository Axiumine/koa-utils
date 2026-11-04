import { buildConstraintEntry } from '@lib/PostgreSQL/error/buildConstraintEntry.mjs'
import { mapDbError } from '@lib/PostgreSQL/error/mapDbError.mjs'
import { expect } from 'chai'

import { leakText } from '../../../helpers/fakeTxPool.mjs'
import { DRIVER_TEXT, mapSetup, payload, PLANTED, SECRET, TABLE, violation } from '../../../helpers/errorHarness.mjs'
import { spiedErrors } from '../../../helpers/spiedErrors.mjs'

describe('mapDbError: a violation that the table holds', () => {
	const cases: [string, string, string][] = [
		['order_items_order_id_sku_uq', 'sku', 'A-100'],
		['order_items_order_id_slot_uq', 'slot', '20:30'],
		['order_items_order_id_bin_uq', 'bin', '8d9b3e2a-5c4f-4a7e-9b1d-2f6a7c8e9d01']
	]
	for (const [name, kind, value] of cases) {
		it(`maps ${name} (23505) to DUPLICATE_ITEM with the kind from the table and the value from the caller`, () => {
			const { log, counts, options } = mapSetup({ details: { value } })
			const error = mapDbError(violation('23505', name), options)
			expect(payload(error)).to.deep.equal({ code: 'DUPLICATE_ITEM', details: { kind, value } })
			expect(error.message).to.equal('DUPLICATE_ITEM')
			expect('cause' in error).to.equal(false)
			expect(log.calls).to.deep.equal([])
			expect(counts).to.deep.equal([])
		})
	}

	it('maps a row without details to its code with no details', () => {
		const { options } = mapSetup()
		const error = mapDbError(violation('23505', 'customers_email_uq'), options)
		expect(payload(error)).to.deep.equal({ code: 'EMAIL_TAKEN' })
		expect(error.details).to.equal(undefined)
	})

	it('asks the factory for make(code) with one argument for a row without details, and make(code, details) with two otherwise', () => {
		const plain = spiedErrors()
		mapDbError(violation('23505', 'customers_email_uq'), mapSetup({ errors: plain.errors }).options)
		expect(plain.make.callCount).to.equal(1)
		expect(plain.make.firstCall.args).to.deep.equal(['EMAIL_TAKEN'])
		expect(plain.internal.callCount).to.equal(0)

		const rich = spiedErrors()
		mapDbError(
			violation('23505', 'order_items_order_id_sku_uq'),
			mapSetup({ errors: rich.errors, details: { value: 'A-1' } }).options
		)
		expect(rich.make.firstCall.args).to.deep.equal(['DUPLICATE_ITEM', { kind: 'sku', value: 'A-1' }])
	})

	it('shows nothing of the driver in the result: not the constraint, the table, the driver text or the planted value', () => {
		const { log, options } = mapSetup({ details: { value: 'A-100' } })
		const error = mapDbError(violation('23505', 'order_items_order_id_sku_uq', { table: 'order_items' }), options)
		const everything = leakText(error, log.calls)
		for (const forbidden of [SECRET, DRIVER_TEXT, 'order_items', 'order_id_sku_uq', 'violates', 'app.customers', 'INSERT']) {
			expect(everything, forbidden).to.not.contain(forbidden)
		}
	})

	it('is looked up by the name for 23514 and 23503 as well', () => {
		const table = Object.freeze({
			a_ck: buildConstraintEntry('INVALID', { fixed: { field: 'locale' } }),
			a_fk: buildConstraintEntry('MISSING', { fixed: { entity: 'group' } })
		})
		const { options } = mapSetup({ table })
		expect(payload(mapDbError(violation('23514', 'a_ck'), options))).to.deep.equal({
			code: 'INVALID',
			details: { field: 'locale' }
		})
		expect(payload(mapDbError(violation('23503', 'a_fk'), options))).to.deep.equal({
			code: 'MISSING',
			details: { entity: 'group' }
		})
	})

	it('does not look at the name for any other SQLSTATE of class 23', () => {
		const { log, options } = mapSetup()
		for (const code of ['23502', '23P01', '23001', '23000']) {
			const error = mapDbError(violation(code, 'customers_email_uq'), options)
			expect(payload(error), code).to.deep.equal({ code: 'INTERNAL', details: { reason: 'DB_ERROR' } })
		}
		expect(log.calls.every((call) => call.fields?.['reason'] === 'DB_ERROR')).to.equal(true)
	})

	it('maps every row of the table to its code when the caller supplies what the row lists', () => {
		for (const [name, entry] of Object.entries(TABLE)) {
			const supplied = Object.fromEntries((entry.supplied ?? []).map((key) => [key, 'v']))
			const { options } = mapSetup({ details: supplied })
			const error = mapDbError(violation('23505', name), options)
			expect(error.code, name).to.equal(entry.code)
			expect(leakText(error, []), name).to.not.contain(name)
		}
	})

	it('keeps a name that is a plain identifier of 63 characters and refuses one of 64', () => {
		const long = 'a'.repeat(63)
		const table = Object.freeze({ [long]: buildConstraintEntry('LONG_NAME') })
		const { options } = mapSetup({ table })
		expect(mapDbError(violation('23505', long), options).code).to.equal('LONG_NAME')
		expect(payload(mapDbError(violation('23505', `${long}a`), options)).details).to.deep.equal({ reason: 'CONSTRAINT_UNMAPPED' })
	})

	it('stays out of the way of a name planted in the driver text', () => {
		const { options } = mapSetup()
		expect(payload(mapDbError(violation('23505', 'customers_email_uq', { message: PLANTED }), options))).to.deep.equal({
			code: 'EMAIL_TAKEN'
		})
	})
})
