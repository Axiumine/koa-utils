import type { ITxClient } from '@lib/PostgreSQL/tx/ITxClient.mjs'

import { catalogRows } from './catalogRows.mjs'
import { catalogText } from './catalogText.mjs'
import { ROLE_CATALOG_SQL } from './ROLE_CATALOG_SQL.mjs'

/**
 * The first role, in name order, that `current_user` is a member of and `allowed` does not list; `undefined` when there
 * is none. The names are sorted here, by code unit, and not by a clause of the statement, so the one that is reported
 * does not depend on the collation of the database.
 */
export async function membershipOutsider(client: ITxClient, allowed: ReadonlySet<string>): Promise<string | undefined> {
	const rows = await catalogRows(client, ROLE_CATALOG_SQL.memberships)
	return (
		rows
			.map((row) => catalogText(row['member_of']))
			// eslint-disable-next-line sonarjs/no-alphabetical-sort -- the default order is by UTF-16 code unit, which is the order wanted; localeCompare would depend on the host locale
			.sort()
			.find((name) => !allowed.has(name))
	)
}
