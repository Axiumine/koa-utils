import { RoleAssertionError } from '@lib/PostgreSQL/error/RoleAssertionError.mjs'
import type { IAssertRoleOptions } from '@lib/PostgreSQL/role/IAssertRoleOptions.mjs'
import type { IRoleGrant } from '@lib/PostgreSQL/role/IRoleGrant.mjs'
import { expect } from 'chai'

import type { IFakeCatalog, THeldAnswer } from './fakeRoleWorld.mjs'

// shared by the assertRole specs. Neutral names only

export const ROLE = 'app_role'

// 5 grants, 1 of each kind assertRole checks: schema, table, column-level, function, sequence
export const GRANTS: IRoleGrant[] = [
	{ object: 'app', privilege: 'USAGE' },
	{ object: 'app.orders', privilege: 'SELECT' },
	{ object: 'app.items', privilege: 'UPDATE', columns: ['label', 'locale'] },
	{ object: 'app.resolve_token', privilege: 'EXECUTE' },
	{ object: 'app.order_seq', privilege: 'USAGE' }
]

// catalog of a role that passes every check
export function healthy(extra: Partial<IFakeCatalog> = {}): IFakeCatalog {
	return { current: ROLE, ...extra }
}

export function options(extra: Partial<IAssertRoleOptions> = {}): IAssertRoleOptions {
	return { expectedRole: ROLE, expectedGrants: GRANTS, ...extra }
}

// await promise, hand back the RoleAssertionError it rejected with. Anything else → spec red
export async function failure(promise: Promise<unknown>): Promise<RoleAssertionError> {
	const error = await promise.then(
		() => undefined,
		(caught: unknown) => caught
	)
	expect(error).to.be.instanceOf(RoleAssertionError)
	return error as RoleAssertionError
}

export function held(...entries: [string, THeldAnswer][]): Map<string, THeldAnswer> {
	return new Map(entries)
}

// connection string with a secret, the shape a caller could pass by mistake as a role name
export function plantedUrl(secret: string): string {
	return `postgres://app_role:${secret}@db.example.test:5432/appdb`
}
