import type { ITxClient } from '@lib/PostgreSQL/tx/ITxClient.mjs'

import { catalogRows } from './catalogRows.mjs'
import type { IRoleRow } from './IRoleRow.mjs'

/** The one row of a statement that must answer exactly one, and an object. Anything else throws. */
export async function catalogRow(client: ITxClient, text: string, values?: readonly unknown[]): Promise<IRoleRow> {
	const rows: readonly unknown[] = await catalogRows(client, text, values)
	const row = rows[0]
	if (rows.length !== 1 || typeof row !== 'object' || row === null) {
		throw new TypeError('the catalog answered an unexpected number of rows')
	}
	return row as IRoleRow
}
