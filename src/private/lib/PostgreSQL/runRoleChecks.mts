import type { IRoleAssertionReason } from '@lib/PostgreSQL/error/IRoleAssertionReason.mjs'
import type { IRoleAssertionSubject } from '@lib/PostgreSQL/error/IRoleAssertionSubject.mjs'
import { RoleAssertionError } from '@lib/PostgreSQL/error/RoleAssertionError.mjs'
import type { ITxClient } from '@lib/PostgreSQL/tx/ITxClient.mjs'

import { catalogFlag } from './catalogFlag.mjs'
import { catalogRow } from './catalogRow.mjs'
import { catalogText } from './catalogText.mjs'
import type { IRolePlan } from './IRolePlan.mjs'
import { membershipOutsider } from './membershipOutsider.mjs'
import { missingGrant } from './missingGrant.mjs'
import { readField } from './readField.mjs'
import { ROLE_ATTRIBUTES } from './ROLE_ATTRIBUTES.mjs'
import { ROLE_CATALOG_SQL } from './ROLE_CATALOG_SQL.mjs'

/**
 * The checks of `assertRole`, on one connection, in this order. The first failure is thrown as a `RoleAssertionError`
 * and ends the check; nothing after it is asked.
 *
 * 1. `current_user` is the expected role (`ROLE_MISMATCH`).
 * 2. The role has none of the five attributes (`ROLE_SUPERUSER`, `ROLE_CREATEROLE`, `ROLE_CREATEDB`, `ROLE_BYPASSRLS`,
 *    `ROLE_REPLICATION`), in that order.
 * 3. The role owns nothing (`ROLE_OWNS_OBJECTS`).
 * 4. The role is a member of no role the call did not allow (`ROLE_MEMBERSHIP`).
 * 5. `session_user` is `current_user` (`SESSION_ROLE_DIFFERS`).
 * 6. Each expected grant is held, in the order of the list (`GRANT_MISSING`).
 *
 * Answers the number of grants checked. A catalog answer that is not what the statements give throws a `TypeError`.
 */
export async function runRoleChecks(client: ITxClient, plan: IRolePlan): Promise<number> {
	const fail = (reason: IRoleAssertionReason, subject?: IRoleAssertionSubject): RoleAssertionError =>
		new RoleAssertionError(reason, plan.role, subject)
	const identity = await catalogRow(client, ROLE_CATALOG_SQL.identity)
	const effective = catalogText(identity['effective_role'])
	if (effective !== plan.role) throw fail('ROLE_MISMATCH')
	for (const [key, reason] of ROLE_ATTRIBUTES) {
		if (catalogFlag(readField(identity, key))) throw fail(reason)
	}
	if (catalogFlag((await catalogRow(client, ROLE_CATALOG_SQL.ownsObjects))['owns'])) throw fail('ROLE_OWNS_OBJECTS')
	const outsider = await membershipOutsider(client, plan.allowed)
	if (outsider !== undefined) throw fail('ROLE_MEMBERSHIP', { object: outsider })
	if (catalogText(identity['login_role']) !== effective) throw fail('SESSION_ROLE_DIFFERS')
	for (const check of plan.checks) {
		const missing = await missingGrant(client, check)
		if (missing !== undefined) throw fail('GRANT_MISSING', missing)
	}
	return plan.checks.length
}
