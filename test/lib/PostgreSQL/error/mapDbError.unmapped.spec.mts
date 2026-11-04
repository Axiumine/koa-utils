import { buildConstraintEntry } from '@lib/PostgreSQL/error/buildConstraintEntry.mjs'
import { mapDbError } from '@lib/PostgreSQL/error/mapDbError.mjs'
import { expect } from 'chai'

import { DRIVER_TEXT, fieldsOf, mapSetup, payload, PLANTED, SECRET, violation } from '../../../helpers/errorHarness.mjs'
import { leakText } from '../../../helpers/fakeTxPool.mjs'
import { recordingLogger } from '../../../helpers/recordingLogger.mjs'
import { appErrors } from '../../../helpers/appErrors.mjs'
import { spiedErrors } from '../../../helpers/spiedErrors.mjs'

describe('mapDbError: a violation that the table does not hold', () => {
	it('answers the internal error (CONSTRAINT_UNMAPPED), logs the name and counts it, with the name in no response', () => {
		for (const sqlstate of ['23505', '23514', '23503']) {
			const { log, counts, options } = mapSetup()
			const error = mapDbError(violation(sqlstate, PLANTED), options)
			expect(payload(error), sqlstate).to.deep.equal({ code: 'INTERNAL', details: { reason: 'CONSTRAINT_UNMAPPED' } })
			expect(counts).to.deep.equal(['db_constraint_unmapped_total'])
			expect(log.calls).to.have.length(1)
			expect(log.calls[0]?.level).to.equal('error')
			expect(log.calls[0]?.message).to.equal('database constraint violation is not in the constraint map')
			expect(fieldsOf(log.calls)).to.deep.equal({ reason: 'CONSTRAINT_UNMAPPED', sqlstate, constraint: PLANTED })
			const response = leakText(error, [])
			for (const forbidden of [PLANTED, DRIVER_TEXT, SECRET]) expect(response, forbidden).to.not.contain(forbidden)
		}
	})

	it('writes no driver text, detail, bound value or table into the log line', () => {
		const { log, options } = mapSetup()
		mapDbError(violation('23505', PLANTED), options)
		const line = JSON.stringify(log.calls)
		expect(line).to.contain(PLANTED)
		for (const forbidden of [SECRET, DRIVER_TEXT, 'violates', 'app.customers', 'INSERT', 'Failing row']) {
			expect(line, forbidden).to.not.contain(forbidden)
		}
	})

	it('answers the same for a violation with no constraint name, and logs no name', () => {
		const { log, counts, options } = mapSetup()
		const error = mapDbError(violation('23505', undefined), options)
		expect(payload(error)).to.deep.equal({ code: 'INTERNAL', details: { reason: 'CONSTRAINT_UNMAPPED' } })
		expect(counts).to.deep.equal(['db_constraint_unmapped_total'])
		expect(fieldsOf(log.calls)).to.deep.equal({ reason: 'CONSTRAINT_UNMAPPED', sqlstate: '23505' })
	})

	it('neither looks up nor logs a name that is not a plain identifier', () => {
		for (const name of ['customers_email_uq ', 'quoted"name', 'x'.repeat(64), 'with space', 'new\nline']) {
			const { log, options } = mapSetup()
			const error = mapDbError(violation('23505', name), options)
			expect(payload(error), name).to.deep.equal({ code: 'INTERNAL', details: { reason: 'CONSTRAINT_UNMAPPED' } })
			expect('constraint' in fieldsOf(log.calls), name).to.equal(false)
		}
	})

	it('finds nothing for a name that every object has (constructor, __proto__): unmapped, name logged', () => {
		for (const name of ['__proto__', 'constructor', 'toString']) {
			const { log, options } = mapSetup()
			const error = mapDbError(violation('23505', name), options)
			expect(payload(error), name).to.deep.equal({ code: 'INTERNAL', details: { reason: 'CONSTRAINT_UNMAPPED' } })
			expect(fieldsOf(log.calls)['constraint'], name).to.equal(name)
		}
	})

	it('asks the factory for internal(reason) only, never for make', () => {
		const spied = spiedErrors()
		mapDbError(violation('23505', PLANTED), mapSetup({ errors: spied.errors }).options)
		expect(spied.internal.callCount).to.equal(1)
		expect(spied.internal.firstCall.args).to.deep.equal(['CONSTRAINT_UNMAPPED'])
		expect(spied.make.callCount).to.equal(0)
	})

	it('works without a counter', () => {
		const log = recordingLogger()
		const error = mapDbError(violation('23505', PLANTED), { errors: appErrors, table: {}, logger: log.logger })
		expect(error.code).to.equal('INTERNAL')
		expect(log.calls).to.have.length(1)
	})

	it('works with a logger that has an error method and nothing else', () => {
		const lines: unknown[] = []
		const error = mapDbError(violation('23505', PLANTED), {
			errors: appErrors,
			table: {},
			logger: { error: (message, fields) => void lines.push([message, fields]) }
		})
		expect(error.code).to.equal('INTERNAL')
		expect(lines).to.have.length(1)
	})
})

describe('mapDbError: a row that maps to the internal code', () => {
	it('answers the internal error (CONSTRAINT_INTERNAL) for a row with the code INTERNAL, with the name logged', () => {
		const { log, counts, options } = mapSetup()
		const error = mapDbError(violation('23514', 'known_ck'), options)
		expect(payload(error)).to.deep.equal({ code: 'INTERNAL', details: { reason: 'CONSTRAINT_INTERNAL' } })
		expect(counts).to.deep.equal(['db_error_internal_total'])
		expect(log.calls[0]?.message).to.equal('database constraint violation is a defect')
		expect(fieldsOf(log.calls)).to.deep.equal({ reason: 'CONSTRAINT_INTERNAL', sqlstate: '23514', constraint: 'known_ck' })
	})

	it('takes the internal code from options.internalCode when given, and then INTERNAL is an ordinary code', () => {
		const table = Object.freeze({
			defect_ck: buildConstraintEntry('E_DEFECT'),
			plain_ck: buildConstraintEntry('INTERNAL')
		})
		const { log, options } = mapSetup({ table, internalCode: 'E_DEFECT' })
		const defect = mapDbError(violation('23514', 'defect_ck'), options)
		expect(payload(defect)).to.deep.equal({ code: 'INTERNAL', details: { reason: 'CONSTRAINT_INTERNAL' } })
		const plain = mapDbError(violation('23514', 'plain_ck'), options)
		expect(payload(plain)).to.deep.equal({ code: 'INTERNAL' })
		expect(log.calls).to.have.length(1)
	})
})
