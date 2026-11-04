import type { IConstraintEntry } from '@lib/PostgreSQL/error/IConstraintEntry.mjs'

import { readField } from './readField.mjs'

/**
 * The details of a row: the fixed ones, then the keys that the row lists from what the caller supplied. `undefined` for a
 * row without details, and `null` when a listed key is missing. Only own keys of `supplied` count, and a key whose value is
 * `undefined` is missing; an empty array or `false` is a value.
 */
export function constraintDetails(
	entry: IConstraintEntry,
	supplied: Readonly<Record<string, unknown>> | undefined
): Record<string, unknown> | null | undefined {
	const keys = entry.supplied ?? []
	if (entry.fixed === undefined && keys.length === 0) return undefined
	const given = supplied ?? {}
	const pairs: [string, unknown][] = []
	for (const key of keys) {
		const value = Object.hasOwn(given, key) ? readField(given, key) : undefined
		if (value === undefined) return null
		pairs.push([key, value])
	}
	return { ...entry.fixed, ...Object.fromEntries(pairs) }
}
