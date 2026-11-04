import type { IRoleAssertionReason } from '@lib/PostgreSQL/error/IRoleAssertionReason.mjs'

/** Which attribute flag of the identity row gives which reason, in the order they are tested. */
export const ROLE_ATTRIBUTES = [
	['superuser', 'ROLE_SUPERUSER'],
	['createrole', 'ROLE_CREATEROLE'],
	['createdb', 'ROLE_CREATEDB'],
	['bypassrls', 'ROLE_BYPASSRLS'],
	['replication', 'ROLE_REPLICATION']
] as const satisfies readonly (readonly [string, IRoleAssertionReason])[]
