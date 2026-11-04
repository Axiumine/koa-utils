import type { IRoleGrant } from './IRoleGrant.mjs'

/** The input of `assertRole`. */
export interface IAssertRoleOptions {
	/** The role this service logs in as. */
	readonly expectedRole: string
	/** What the role needs; an empty list checks the role and nothing else. */
	readonly expectedGrants: readonly IRoleGrant[]
	/** Roles the role may be a member of, by name. Default: none. */
	readonly allowedMemberships?: readonly string[]
}
