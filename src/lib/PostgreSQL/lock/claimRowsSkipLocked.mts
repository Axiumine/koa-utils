import type { ITx } from '@lib/PostgreSQL/tx/ITx.mjs'

import { CLAIM_LIMIT_MAX } from './CLAIM_LIMIT_MAX.mjs'
import type { IClaimRegistry } from './IClaimRegistry.mjs'
import type { IClaimRequest } from './IClaimRequest.mjs'
import { lockedRows } from './lockedRows.mjs'

/**
 * The one row-claim primitive: runs the statement that the registry holds for a table and a predicate name, with the
 * number of rows as `$1`, and tells the clock when it claimed any. The statement is written by the caller and is expected
 * to take its rows with `FOR UPDATE SKIP LOCKED`, oldest first, so that rows another transaction holds are skipped, never
 * waited for, and several workers claim apart by construction. The kit holds no statement and no lock clause: a name that
 * is not an own key of the registry is a `TypeError`, and the only value from the request that reaches the database is
 * the limit, bound as a parameter. A claim takes no rank in the order of a tracker (it is a queue operation). The caller
 * commits the claim before it does anything slow with the rows.
 *
 * The checks, in order: the table, the predicate, the limit (a whole number from 1 to `CLAIM_LIMIT_MAX`). Each failure is a
 * `TypeError`, before any statement.
 */
export async function claimRowsSkipLocked<TRow>(tx: ITx, claims: IClaimRegistry, request: IClaimRequest): Promise<TRow[]> {
	const { table, predicate, limit } = request
	const tableStatements: Readonly<Record<string, string>> | undefined = Object.hasOwn(claims, table)
		? Reflect.get(claims, table)
		: undefined
	if (tableStatements === undefined) {
		throw new TypeError('table is not in the closed list of claim tables')
	}
	if (!Object.hasOwn(tableStatements, predicate)) {
		throw new TypeError(`predicate is not in the closed list of ${table}`)
	}
	if (!Number.isInteger(limit) || limit < 1 || limit > CLAIM_LIMIT_MAX) {
		throw new TypeError(`limit must be a whole number from 1 to ${String(CLAIM_LIMIT_MAX)}`)
	}
	const { rows } = await tx.query<TRow>(Reflect.get(tableStatements, predicate), [limit])
	return lockedRows(tx, rows)
}
