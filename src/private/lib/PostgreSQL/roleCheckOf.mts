import type { IRoleCheck } from './IRoleCheck.mjs'
import { isNameList } from './isNameList.mjs'
import { isOneOf } from './isOneOf.mjs'
import { isQualifiedName } from './isQualifiedName.mjs'
import { isRoleName } from './isRoleName.mjs'
import { ROLE_PRIVILEGES } from './ROLE_PRIVILEGES.mjs'

/** The fields of a grant as an untyped caller may have given them. */
interface ILooseGrant {
	readonly object?: unknown
	readonly privilege?: unknown
	readonly columns?: unknown
}

/** A grant on a schema: `USAGE` or `CREATE`, and no column list. */
function schemaCheck(object: string, privilege: unknown, columns: unknown): IRoleCheck | undefined {
	return columns === undefined && isOneOf(ROLE_PRIVILEGES.schema, privilege) ? { kind: 'schema', object, privilege } : undefined
}

/** A column-level grant: a privilege a column can hold, on a non-empty list of plain column names. */
function columnCheck(object: string, privilege: unknown, columns: unknown): IRoleCheck | undefined {
	if (!isOneOf(ROLE_PRIVILEGES.column, privilege)) return undefined
	if (!isNameList(columns) || columns.length === 0) return undefined
	return { kind: 'columns', object, privilege, columns }
}

/** A grant on `schema.name`: `EXECUTE` on a function, a column-level privilege on a table, or a table or sequence privilege. */
function qualifiedCheck(object: string, privilege: unknown, columns: unknown): IRoleCheck | undefined {
	if (privilege === 'EXECUTE') return columns === undefined ? { kind: 'function', object, privilege } : undefined
	if (columns !== undefined) return columnCheck(object, privilege, columns)
	return isOneOf(ROLE_PRIVILEGES.relation, privilege) ? { kind: 'relation', object, privilege } : undefined
}

/**
 * Reads one entry of `expectedGrants` into a check, or answers `undefined` when its shape is wrong: not an object, an
 * object that is neither a plain name (a schema) nor `schema.name`, a privilege the kind of object cannot hold, or
 * `columns` on anything but a table privilege that a column can hold.
 */
export function roleCheckOf(grant: unknown): IRoleCheck | undefined {
	if (typeof grant !== 'object' || grant === null) return undefined
	const { object, privilege, columns } = grant as ILooseGrant
	if (isRoleName(object)) return schemaCheck(object, privilege, columns)
	return isQualifiedName(object) ? qualifiedCheck(object, privilege, columns) : undefined
}
