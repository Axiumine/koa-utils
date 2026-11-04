import { RoleAssertionError } from '@lib/PostgreSQL/error/RoleAssertionError.mjs'

import type { IRoleCheck } from './IRoleCheck.mjs'
import type { IRolePlan } from './IRolePlan.mjs'
import { isNameList } from './isNameList.mjs'
import { isRoleName } from './isRoleName.mjs'
import { roleCheckOf } from './roleCheckOf.mjs'

/** The fields of the options as an untyped caller may have given them. */
interface ILooseOptions {
	readonly expectedRole?: unknown
	readonly expectedGrants?: unknown
	readonly allowedMemberships?: unknown
}

/**
 * Reads the options of `assertRole` into a plan, or throws `INVALID_EXPECTATION`. Nothing here touches the pool. A
 * caller from plain JavaScript may pass anything, so every field is checked as it is read. The error is given the role
 * as it came: `RoleAssertionError` prints a role that is not a plain name as `?`.
 */
export function rolePlan(options: unknown): IRolePlan {
	const { expectedRole, expectedGrants, allowedMemberships = [] } = (options ?? {}) as ILooseOptions
	const invalid = (): RoleAssertionError => new RoleAssertionError('INVALID_EXPECTATION', expectedRole as string)
	if (!isRoleName(expectedRole)) throw invalid()
	if (!Array.isArray(expectedGrants) || !isNameList(allowedMemberships)) throw invalid()
	const checks: IRoleCheck[] = []
	for (const grant of expectedGrants as readonly unknown[]) {
		const check = roleCheckOf(grant)
		if (check === undefined) throw invalid()
		checks.push(check)
	}
	return { role: expectedRole, allowed: new Set(allowedMemberships), checks }
}
