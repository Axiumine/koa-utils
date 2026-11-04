import type { IConstraintTable } from '@lib/PostgreSQL/error/IConstraintTable.mjs'
import type { IDbErrorCounterName } from '@lib/PostgreSQL/error/IDbErrorCounterName.mjs'
import type { IDbErrorFactory } from '@lib/PostgreSQL/error/IDbErrorFactory.mjs'
import type { IMapDbErrorOptions } from '@lib/PostgreSQL/error/IMapDbErrorOptions.mjs'
import { mapDbError } from '@lib/PostgreSQL/error/mapDbError.mjs'
import type { IPoolLogger } from '@lib/PostgreSQL/pool/IPoolLogger.mjs'
import type { ITxCounterName } from '@lib/PostgreSQL/tx/ITxCounterName.mjs'
import { expect } from 'chai'

import { type AppError, appErrors } from '../../../helpers/appErrors.mjs'

// type test. Each @ts-expect-error line fail `yarn typecheck:tests` once line below start to compile.
// Fn holding them never called. build:tests is noCheck → only that gate prove it

// compiled, never run. result type flows from the factory
function resultIsTheFamilyOfTheFactory(logger: IPoolLogger, table: IConstraintTable): void {
	const error: AppError = mapDbError(new Error('x'), { errors: appErrors, table, logger })
	// @ts-expect-error -- result is AppError, not a Date
	const wrong: Date = mapDbError(new Error('x'), { errors: appErrors, table, logger })
	void [error, wrong]
	const plain: IDbErrorFactory = {
		is: (e): e is Error => e instanceof Error,
		make: (code) => new Error(code),
		internal: (r) => new Error(r)
	}
	const base: Error = mapDbError(new Error('x'), { errors: plain, table, logger })
	void base
}

// compiled, never run. options: errors and table and logger required
function optionsAreChecked(logger: IPoolLogger, table: IConstraintTable): void {
	const full: IMapDbErrorOptions<AppError> = { errors: appErrors, table, logger }
	// only `error` of the logger is read
	const errorOnly: IMapDbErrorOptions<AppError> = { errors: appErrors, table, logger: { error: () => undefined } }
	// counter typed over a wider list is accepted as it is
	const wide: (name: IDbErrorCounterName | ITxCounterName) => void = () => undefined
	const withWideCounter: IMapDbErrorOptions<AppError> = { errors: appErrors, table, logger, counter: wide }
	void [full, errorOnly, withWideCounter]
	// @ts-expect-error -- errors is required: the kit cannot build an error of your family without it
	void mapDbError(new Error('x'), { table, logger })
	// @ts-expect-error -- table is required: the kit holds no constraint data
	void mapDbError(new Error('x'), { errors: appErrors, logger })
	// @ts-expect-error -- logger is required
	void mapDbError(new Error('x'), { errors: appErrors, table })
	// @ts-expect-error -- logger without an error method
	void mapDbError(new Error('x'), { errors: appErrors, table, logger: { warn: () => undefined } })
	// @ts-expect-error -- errors without make: mapDbError reads all three members
	void mapDbError(new Error('x'), { errors: { is: appErrors.is, internal: appErrors.internal }, table, logger })
	const oneName = (name: 'db_error_internal_total'): void => void name
	// @ts-expect-error -- counter that takes one name only is called with both
	const narrow: IMapDbErrorOptions<AppError> = { errors: appErrors, table, logger, counter: oneName }
	void narrow
	// @ts-expect-error -- details values are free, but details itself must be an object
	const badDetails: IMapDbErrorOptions<AppError> = { errors: appErrors, table, logger, details: 'x' }
	void badDetails
}

describe('mapDbError: the types', () => {
	it('are checked by the compiler (yarn typecheck:tests): the result is the family of the factory, three options are required', () => {
		expect(typeof resultIsTheFamilyOfTheFactory).to.equal('function')
		expect(typeof optionsAreChecked).to.equal('function')
	})
})
