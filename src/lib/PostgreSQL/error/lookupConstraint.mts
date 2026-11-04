import type { IConstraintEntry } from './IConstraintEntry.mjs'
import type { IConstraintTable } from './IConstraintTable.mjs'

/**
 * The row for a constraint name, or `undefined`. Only own keys count, so a name such as `constructor` or `__proto__` (the
 * server accepts any quoted identifier) finds nothing: the table is searched by its own entries, never indexed by the name.
 */
export function lookupConstraint<TCode extends string>(
	table: IConstraintTable<TCode>,
	name: string
): IConstraintEntry<TCode> | undefined {
	return Object.entries(table).find(([key]) => key === name)?.[1]
}
