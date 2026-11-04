import type { IRoleAssertionSubject } from '@lib/PostgreSQL/error/IRoleAssertionSubject.mjs'
import type { ITxClient } from '@lib/PostgreSQL/tx/ITxClient.mjs'

import { catalogRows } from './catalogRows.mjs'
import { catalogText } from './catalogText.mjs'
import type { IRoleColumnCheck } from './IRoleColumnCheck.mjs'
import { ROLE_CATALOG_SQL } from './ROLE_CATALOG_SQL.mjs'

/**
 * The first column of a column-level check that the role does not hold the privilege on, in the order of the list, named
 * as a subject; `undefined` when it holds all. A column the table does not have is missing too: the statement answers
 * a row only for a column that exists.
 */
export async function missingColumn(client: ITxClient, check: IRoleColumnCheck): Promise<IRoleAssertionSubject | undefined> {
	const rows = await catalogRows(client, ROLE_CATALOG_SQL.grant.columns, [check.object, check.privilege, check.columns])
	const held = new Set(rows.filter((row) => row['held'] === true).map((row) => catalogText(row['name'])))
	const column = check.columns.find((name) => !held.has(name))
	return column === undefined ? undefined : { object: check.object, privilege: check.privilege, column }
}
