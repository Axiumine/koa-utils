import { guardVersion } from '@lib/PostgreSQL/guard/guardVersion.mjs'
import type { IVersionGuardCode } from '@lib/PostgreSQL/guard/IVersionGuardCode.mjs'
import type { IVersionGuardInput } from '@lib/PostgreSQL/guard/IVersionGuardInput.mjs'
import type { IPoolLogger } from '@lib/PostgreSQL/pool/IPoolLogger.mjs'
import type { ITx } from '@lib/PostgreSQL/tx/ITx.mjs'
import { expect } from 'chai'

import { type AppError, appErrors } from '../../../helpers/appErrors.mjs'

// type test. Each @ts-expect-error line fail `yarn typecheck:tests` once line below start to compile.
// Fn holding them never called. build:tests is noCheck → only that gate prove it

// compiled, never run. input checked
function inputIsChecked(tx: ITx, logger: IPoolLogger): void {
	const base = { reread: { text: 'SELECT 1' }, expected: 1, entity: 'order', errors: appErrors, logger } as const
	const ok: IVersionGuardInput<AppError> = { ...base, field: 'rev' }
	const other: IVersionGuardInput<AppError> = { ...base, field: 'version' }
	// make + internal is all the guard reads
	const slim: IVersionGuardInput<AppError> = {
		...base,
		field: 'rev',
		errors: { make: appErrors.make, internal: appErrors.internal }
	}
	// counter over a wider list is accepted
	const counted: IVersionGuardInput<AppError> = { ...base, field: 'rev', counter: (name: string) => void name }
	// handle with query only is enough: the whole handle fits too
	void guardVersion(tx, ok)
	void [other, slim, counted]
	// @ts-expect-error -- field must be version or rev
	const badField: IVersionGuardInput<AppError> = { ...base, field: 'status' }
	// @ts-expect-error -- errors is required
	const noErrors: IVersionGuardInput<AppError> = { reread: base.reread, expected: 1, entity: 'order', logger, field: 'rev' }
	// @ts-expect-error -- errors without internal
	const noInternal: IVersionGuardInput<AppError> = { ...base, field: 'rev', errors: { make: appErrors.make } }
	// @ts-expect-error -- errors without make
	const noMake: IVersionGuardInput<AppError> = { ...base, field: 'rev', errors: { internal: appErrors.internal } }
	const otherName = (name: 'db_tx_retries_total'): void => void name
	// @ts-expect-error -- counter that takes another name than db_error_internal_total
	const wrongCounter: IVersionGuardInput<AppError> = { ...base, field: 'rev', counter: otherName }
	// @ts-expect-error -- values must be an array
	const badValues: IVersionGuardInput<AppError> = { ...base, field: 'rev', reread: { text: 'x', values: 'y' } }
	void [badField, noErrors, noInternal, noMake, wrongCounter, badValues]
}

// compiled, never run. result is the family of the factory; the codes are a closed union
async function resultAndCodes(tx: ITx, input: IVersionGuardInput<AppError>): Promise<void> {
	const error: AppError = await guardVersion(tx, input)
	// @ts-expect-error -- result is AppError, not a Date
	const wrong: Date = await guardVersion(tx, input)
	const code: IVersionGuardCode = 'STALE_REV'
	// @ts-expect-error -- not a code of the guard
	const other: IVersionGuardCode = 'GONE'
	void [error, wrong, code, other]
}

describe('guardVersion: the types', () => {
	it('are checked by the compiler (yarn typecheck:tests): the input names a field of two, errors and logger are required', () => {
		expect(typeof inputIsChecked).to.equal('function')
		expect(typeof resultAndCodes).to.equal('function')
	})
})
