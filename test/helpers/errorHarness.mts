import { buildConstraintEntry } from '@lib/PostgreSQL/error/buildConstraintEntry.mjs'
import type { IDbErrorCounterName } from '@lib/PostgreSQL/error/IDbErrorCounterName.mjs'
import type { IMapDbErrorOptions } from '@lib/PostgreSQL/error/IMapDbErrorOptions.mjs'

import { type AppError, appErrors } from './appErrors.mjs'
import { driverError } from './fakeTxPool.mjs'
import { recordingLogger } from './recordingLogger.mjs'

// planted values. Spec look for them in every result, serialisation, log line
export const SECRET = 'planted-secret-s3cret-9f2c'
export const PLANTED = 'zz_planted_secretname_uq'
export const DRIVER_TEXT = `duplicate key value violates unique constraint "${PLANTED}"`

// table of the specs: 3 rows w/ details, 1 w/o, 1 row mapped to the internal code
export const TABLE = Object.freeze({
	order_items_order_id_sku_uq: buildConstraintEntry('DUPLICATE_ITEM', { fixed: { kind: 'sku' }, supplied: ['value'] }),
	order_items_order_id_slot_uq: buildConstraintEntry('DUPLICATE_ITEM', { fixed: { kind: 'slot' }, supplied: ['value'] }),
	order_items_order_id_bin_uq: buildConstraintEntry('DUPLICATE_ITEM', { fixed: { kind: 'bin' }, supplied: ['value'] }),
	customers_email_uq: buildConstraintEntry('EMAIL_TAKEN'),
	bin_in_use_fk: buildConstraintEntry('BIN_IN_USE', { supplied: ['orderIds'] }),
	known_ck: buildConstraintEntry('INTERNAL')
})

// error as node-postgres make it for a violation, w/ every field that can quote a value. constraint undefined → field absent
export function violation(code: string, constraint: string | undefined, extra: Record<string, unknown> = {}): Error {
	return driverError(code, DRIVER_TEXT, {
		severity: 'ERROR',
		detail: `Failing row contains (${SECRET}).`,
		hint: SECRET,
		schema: 'app',
		table: 'customers',
		column: 'email',
		where: `SQL statement with ${SECRET}`,
		internalQuery: SECRET,
		query: `INSERT INTO app.customers (email) VALUES ('${SECRET}')`,
		values: [SECRET],
		parameters: [SECRET],
		...(constraint === undefined ? {} : { constraint }),
		...extra
	})
}

// recorded logger + recorded counter + options over TABLE. overrides win
export function mapSetup(overrides: Partial<IMapDbErrorOptions<AppError>> = {}) {
	const log = recordingLogger()
	const counts: IDbErrorCounterName[] = []
	const options: IMapDbErrorOptions<AppError> = {
		errors: appErrors,
		table: TABLE,
		logger: log.logger,
		counter: (name) => void counts.push(name),
		...overrides
	}
	return { log, counts, options }
}

// what goes to a response: code + details. details key absent when none
export function payload(error: AppError): { code: string; details?: unknown } {
	return error.details === undefined ? { code: error.code } : { code: error.code, details: error.details }
}

// fields of the n-th log call, or fail
export function fieldsOf(
	calls: readonly { fields: Readonly<Record<string, unknown>> | undefined }[],
	index = 0
): Readonly<Record<string, unknown>> {
	const fields = calls[index]?.fields
	if (fields === undefined) throw new Error(`no log call ${String(index)}`)
	return fields
}
