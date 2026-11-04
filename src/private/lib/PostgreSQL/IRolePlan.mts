import type { IRoleCheck } from './IRoleCheck.mjs'

/** The options of `assertRole` after validation: nothing in it needs another look at the caller's input. */
export interface IRolePlan {
	readonly role: string
	readonly allowed: ReadonlySet<string>
	readonly checks: readonly IRoleCheck[]
}
