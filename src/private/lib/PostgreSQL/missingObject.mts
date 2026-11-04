import type { IRoleAssertionSubject } from '@lib/PostgreSQL/error/IRoleAssertionSubject.mjs'
import type { ITxClient } from '@lib/PostgreSQL/tx/ITxClient.mjs'

import { catalogRows } from './catalogRows.mjs'
import type { IRoleObjectCheck } from './IRoleObjectCheck.mjs'
import { ROLE_CATALOG_SQL } from './ROLE_CATALOG_SQL.mjs'

/**
 * The object and the privilege of a check on a schema, a function, or a table, view or sequence, as a subject, unless
 * the answer is exactly one row whose `held` is the boolean `true`. A missing object, a `NULL`, a `false`, a second row
 * and a value that is not a boolean are all a missing grant. A function check passes the schema and the function name as
 * two values; the others pass the object and the privilege.
 */
export async function missingObject(client: ITxClient, check: IRoleObjectCheck): Promise<IRoleAssertionSubject | undefined> {
	const values = check.kind === 'function' ? check.object.split('.') : [check.object, check.privilege]
	const rows = await catalogRows(client, ROLE_CATALOG_SQL.grant[check.kind], values)
	return rows.length === 1 && rows[0]?.['held'] === true ? undefined : { object: check.object, privilege: check.privilege }
}
