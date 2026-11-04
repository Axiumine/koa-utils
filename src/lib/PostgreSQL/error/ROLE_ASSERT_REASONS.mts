/**
 * The closed reasons of a failed role assertion (see {@link RoleAssertionError}). The first one that applies is
 * reported, in this order:
 *
 * - `INVALID_EXPECTATION`: the options of the call are malformed (a role or object name that is not a plain
 *   identifier, a privilege the kind of object cannot hold, a column list on a function). A defect of the calling code,
 *   found before the pool is asked for a connection.
 * - `ROLE_MISMATCH`: `current_user` is not the expected role.
 * - `ROLE_SUPERUSER`, `ROLE_CREATEROLE`, `ROLE_CREATEDB`, `ROLE_BYPASSRLS`, `ROLE_REPLICATION`: the role has that
 *   attribute.
 * - `ROLE_OWNS_OBJECTS`: the catalog lists at least one object owned by the role.
 * - `ROLE_MEMBERSHIP`: the role is a member, directly or through another role, of a role that the call did not allow.
 *   `object` names the first such role.
 * - `SESSION_ROLE_DIFFERS`: `current_user` is the expected role but `session_user` is another: the connection logged in
 *   as one role and switched to this one (`SET ROLE`), so the login holds more.
 * - `GRANT_MISSING`: an expected privilege is not held. `object`, `privilege` and (for a column-level grant) `column`
 *   name the first one that is missing, in the order of the list.
 * - `CHECK_FAILED`: the check could not be made (no connection, a catalog query that failed). `code` holds the short
 *   driver or SQLSTATE code when there is one.
 */
export const ROLE_ASSERT_REASONS = [
	'INVALID_EXPECTATION',
	'ROLE_MISMATCH',
	'ROLE_SUPERUSER',
	'ROLE_CREATEROLE',
	'ROLE_CREATEDB',
	'ROLE_BYPASSRLS',
	'ROLE_REPLICATION',
	'ROLE_OWNS_OBJECTS',
	'ROLE_MEMBERSHIP',
	'SESSION_ROLE_DIFFERS',
	'GRANT_MISSING',
	'CHECK_FAILED'
] as const
