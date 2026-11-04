import { RoleAssertionError } from '@lib/PostgreSQL/error/RoleAssertionError.mjs'
import { checkRoleOnClient } from '@private/lib/PostgreSQL/checkRoleOnClient.mjs'
import { roleFailureSubject } from '@private/lib/PostgreSQL/roleFailureSubject.mjs'
import { rolePlan } from '@private/lib/PostgreSQL/rolePlan.mjs'

import type { IAssertRoleOptions } from './IAssertRoleOptions.mjs'
import type { IRoleAssertion } from './IRoleAssertion.mjs'
import type { IRolePool } from './IRolePool.mjs'

/**
 * The boot assertion of a database role: `assertRole(pool, { expectedRole, expectedGrants })`.
 *
 * A service proves at boot that it runs as the role it believes it is, that the role cannot do what it must not, and
 * that the grants it needs are there. A service wired to a more privileged login (a migration role, an administrator,
 * a superuser) stops before it opens a listener. It is a boot check, run once on one connection; it is not a
 * per-request check, and nothing here is meant for a request path.
 *
 * What it asks the server, in this order, on one checked-out connection (the first failure is reported and ends the
 * check):
 *
 * 1. `current_user` is the expected role (`ROLE_MISMATCH`).
 * 2. The role is not a superuser and has no CREATEROLE, CREATEDB, BYPASSRLS or REPLICATION attribute; the flags are read
 *    from `pg_roles`.
 * 3. The role owns nothing: `pg_shdepend`, the shared dependency catalog, holds one `o` row (owner) for every object of
 *    every database of the cluster that a role owns, so a single catalog read answers for tables, functions, schemas,
 *    types, databases and the rest, with no list of catalogs to keep.
 * 4. The role is a member of no other role, directly or through a chain of roles, except those the caller names in
 *    `allowedMemberships` (default none). `pg_auth_members` is walked with a recursive query.
 * 5. `session_user` is `current_user`: the connection did not log in as one role and switch to another.
 * 6. Each expected grant is held, checked with the catalog privilege functions (`has_schema_privilege`,
 *    `has_table_privilege`, `has_column_privilege`, `has_sequence_privilege`, `has_function_privilege`) for
 *    `current_user`. The first one that is not held is named, object and privilege.
 *
 * The expected grants are a parameter: a list of `{ object, privilege }` pairs (and `columns` for a column-level
 * grant). Nothing about any particular role is built in.
 *
 * Resolves with a short record and leaves the pool open. On any failure it closes the pool first and then throws a
 * `RoleAssertionError` (closed `reason`, the role name, no connection string); a failure that is not an assertion (the
 * connection is refused, a catalog query fails) is `CHECK_FAILED`, never a pass. The error never carries the connection
 * string: the function is given the pool, not the URL, and every name in the message passes a shape check.
 */
export async function assertRole(pool: IRolePool, options: IAssertRoleOptions): Promise<IRoleAssertion> {
	try {
		return await checkRoleOnClient(pool, rolePlan(options))
	} catch (error) {
		try {
			await pool.end()
		} catch {
			// The pool is being abandoned; the failure to report is the one below.
		}
		if (error instanceof RoleAssertionError) throw error
		// Only a failure after the plan was made reaches this line, so the role name is a valid one.
		throw new RoleAssertionError('CHECK_FAILED', options.expectedRole, roleFailureSubject(error))
	}
}
