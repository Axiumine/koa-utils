import { DbConnectError } from '@lib/PostgreSQL/error/DbConnectError.mjs'
import { DbParseError } from '@lib/PostgreSQL/error/DbParseError.mjs'
import { DbTxError } from '@lib/PostgreSQL/error/DbTxError.mjs'
import { DB_INTERNAL_REASONS } from '@lib/PostgreSQL/error/DB_INTERNAL_REASONS.mjs'
import { mapDbError } from '@lib/PostgreSQL/error/mapDbError.mjs'
import { expect } from 'chai'

import { AppError } from '../../../helpers/appErrors.mjs'
import { fieldsOf, mapSetup, payload, PLANTED, SECRET, violation } from '../../../helpers/errorHarness.mjs'
import { leakText } from '../../../helpers/fakeTxPool.mjs'
import { spiedErrors } from '../../../helpers/spiedErrors.mjs'

describe('mapDbError: what is passed through', () => {
	it('returns an error of the factory as it is, the same object, without logging, counting or building', () => {
		const spied = spiedErrors()
		const { log, counts, options } = mapSetup({ errors: spied.errors })
		const own = new AppError('INTERNAL', { reason: 'LOCK_TIMEOUT' })
		expect(mapDbError(own, options)).to.equal(own)
		const stale = new AppError('STALE_VERSION')
		expect(mapDbError(stale, options)).to.equal(stale)
		expect(log.calls).to.deep.equal([])
		expect(counts).to.deep.equal([])
		expect(spied.make.callCount + spied.internal.callCount).to.equal(0)
		expect(spied.is.callCount).to.equal(2)
	})

	it('returns an error of the factory before it looks at a SQLSTATE on it', () => {
		const { options } = mapSetup()
		const own = Object.assign(new AppError('DUPLICATE_ITEM'), { code: '23505' })
		expect(mapDbError(own, options)).to.equal(own)
	})
})

describe('mapDbError: every other failure', () => {
	it('answers the internal error (DB_ERROR) for another SQLSTATE and logs only the SQLSTATE', () => {
		for (const code of ['42501', '57014', '40001', '55P03', '08006', '53300', '42P01']) {
			const { log, counts, options } = mapSetup()
			const error = mapDbError(violation(code, PLANTED), options)
			expect(payload(error), code).to.deep.equal({ code: 'INTERNAL', details: { reason: 'DB_ERROR' } })
			expect(counts).to.deep.equal(['db_error_internal_total'])
			expect(log.calls[0]?.message).to.equal('database error')
			expect(fieldsOf(log.calls)).to.deep.equal({ reason: 'DB_ERROR', sqlstate: code })
			const line = JSON.stringify(log.calls)
			expect(line).to.not.contain(PLANTED)
			expect(line).to.not.contain(SECRET)
			expect(leakText(error, [])).to.not.contain(SECRET)
		}
	})

	describe('the typed errors of the kit, with the closed reason of each logged', () => {
		const cases: [string, unknown, string, string, Record<string, unknown>][] = [
			[
				'DbParseError',
				new DbParseError('MALFORMED', 'date'),
				'DB_VALUE_UNREADABLE',
				'database value cannot be read',
				{ errorReason: 'MALFORMED', typeName: 'date' }
			],
			[
				'DbConnectError',
				new DbConnectError('CONNECT_FAILED', 'ECONNREFUSED'),
				'DB_CONNECTION',
				'database connection refused',
				{ errorReason: 'CONNECT_FAILED' }
			],
			[
				'DbConnectError without a code',
				new DbConnectError('TIMEZONE_NOT_UTC'),
				'DB_CONNECTION',
				'database connection refused',
				{ errorReason: 'TIMEZONE_NOT_UTC' }
			],
			[
				'DbTxError',
				new DbTxError('HANDLE_CLOSED'),
				'DB_TX_MISUSE',
				'database transaction misused',
				{ errorReason: 'HANDLE_CLOSED' }
			]
		]
		for (const [title, thrown, reason, message, fields] of cases) {
			it(`maps ${title} to the internal error (${reason})`, () => {
				const { log, counts, options } = mapSetup()
				const error = mapDbError(thrown, options)
				expect(payload(error)).to.deep.equal({ code: 'INTERNAL', details: { reason } })
				expect(counts).to.deep.equal(['db_error_internal_total'])
				expect(log.calls[0]?.level).to.equal('error')
				expect(log.calls[0]?.message).to.equal(message)
				expect(fieldsOf(log.calls)).to.deep.equal({ reason, ...fields })
			})
		}

		it('keeps the typed error ahead of its own SQLSTATE: a DbConnectError carrying a code is not looked up as a violation', () => {
			const { log, options } = mapSetup()
			const thrown = Object.assign(new DbConnectError('CONNECT_FAILED'), { code: '23505', constraint: 'customers_email_uq' })
			expect(payload(mapDbError(thrown, options)).details).to.deep.equal({ reason: 'DB_CONNECTION' })
			expect('constraint' in fieldsOf(log.calls)).to.equal(false)
		})
	})

	it('maps anything else to the internal error (UNEXPECTED_ERROR), logging the class name and never the message', () => {
		for (const thrown of [new TypeError(`bad ${SECRET}`), Object.assign(new Error(SECRET), { name: 'CustomError' })]) {
			const { log, counts, options } = mapSetup()
			const error = mapDbError(thrown, options)
			expect(payload(error)).to.deep.equal({ code: 'INTERNAL', details: { reason: 'UNEXPECTED_ERROR' } })
			expect(counts).to.deep.equal(['db_error_internal_total'])
			expect(log.calls[0]?.message).to.equal('unexpected error at the database boundary')
			expect(JSON.stringify(log.calls)).to.not.contain(SECRET)
			expect(leakText(error, [])).to.not.contain(SECRET)
			expect(fieldsOf(log.calls)).to.deep.equal({ reason: 'UNEXPECTED_ERROR', errorName: thrown.name })
		}
	})

	it('maps a value that is no error, and a name that is no identifier, without a class name in the log', () => {
		for (const thrown of [undefined, null, SECRET, 42, {}, { name: 'has space', message: SECRET }]) {
			const { log, options } = mapSetup()
			const error = mapDbError(thrown, options)
			expect(payload(error)).to.deep.equal({ code: 'INTERNAL', details: { reason: 'UNEXPECTED_ERROR' } })
			expect(JSON.stringify(log.calls)).to.not.contain(SECRET)
			expect(fieldsOf(log.calls)).to.deep.equal({ reason: 'UNEXPECTED_ERROR' })
		}
	})

	it('treats a SQLSTATE that is not five safe characters as no SQLSTATE', () => {
		for (const code of ['2350', '23505x', '23 05', 23505]) {
			const { log, options } = mapSetup()
			const error = mapDbError(Object.assign(new Error('x'), { code }), options)
			expect(payload(error).details, String(code)).to.deep.equal({ reason: 'UNEXPECTED_ERROR' })
			expect('sqlstate' in fieldsOf(log.calls)).to.equal(false)
		}
	})
})

describe('mapDbError: the closed reasons', () => {
	it('carries only a member of DB_INTERNAL_REASONS in the details of every internal error it builds', () => {
		const { options } = mapSetup()
		const samples = [
			mapDbError(violation('23505', PLANTED), options),
			mapDbError(violation('23514', 'known_ck'), options),
			mapDbError(violation('23505', 'order_items_order_id_sku_uq'), options),
			mapDbError(violation('42501', undefined), options),
			mapDbError(new DbParseError('MALFORMED', 'date'), options),
			mapDbError(new DbConnectError('URL_INVALID'), options),
			mapDbError(new DbTxError('HANDLE_CLOSED'), options),
			mapDbError(new TypeError('x'), options)
		]
		const seen = new Set<unknown>()
		for (const error of samples) {
			expect(error.code).to.equal('INTERNAL')
			expect(Object.keys(error.details as object)).to.deep.equal(['reason'])
			const reason = (error.details as { reason: unknown }).reason
			expect(DB_INTERNAL_REASONS as readonly unknown[]).to.include(reason)
			seen.add(reason)
		}
		// 8 samples → 8 different reasons: no reason is built from the wrong branch
		expect(seen.size).to.equal(8)
	})
})
