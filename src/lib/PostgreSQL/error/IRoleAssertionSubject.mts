/* eslint-disable sonarjs/no-redundant-optional -- under exactOptionalPropertyTypes `?: T` rejects an explicit `undefined`, so `| undefined` is what lets a caller pass `{ code: maybeCode }` */
/**
 * What a failed assertion names besides the role. Every field is optional and none is ever a value from the driver. A
 * field given as `undefined` means the same as a field left out.
 */
export interface IRoleAssertionSubject {
	/** The role it is a member of (`ROLE_MEMBERSHIP`), or the schema, table, sequence or function (`GRANT_MISSING`). */
	readonly object?: string | undefined
	readonly privilege?: string | undefined
	readonly column?: string | undefined
	/** The short driver or SQLSTATE code of a `CHECK_FAILED`. */
	readonly code?: string | undefined
}
