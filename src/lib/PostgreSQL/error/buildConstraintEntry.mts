import type { IConstraintEntry } from './IConstraintEntry.mjs'

/** What {@link buildConstraintEntry} reads of its second argument. */
interface IConstraintParts {
	readonly fixed?: object
	readonly supplied?: readonly PropertyKey[]
}

/**
 * Builds and freezes one row of a constraint table. `fixed` and `supplied` are copied, so the caller's arguments are not
 * shared with the row, and an empty `supplied` list is dropped.
 *
 * It checks nothing about the code and the details: that is the job of the typed view of it, `IConstraintEntryBuilder`,
 * which an application instantiates over its own codes and its details-by-code map.
 */
export function buildConstraintEntry<TCode extends string>(code: TCode, parts: IConstraintParts = {}): IConstraintEntry<TCode> {
	const entry: { code: TCode; fixed?: Readonly<Record<string, unknown>>; supplied?: readonly string[] } = { code }
	if (parts.fixed !== undefined) entry.fixed = Object.freeze({ ...parts.fixed })
	if (parts.supplied !== undefined && parts.supplied.length > 0) entry.supplied = Object.freeze(parts.supplied.map(String))
	return Object.freeze(entry)
}
