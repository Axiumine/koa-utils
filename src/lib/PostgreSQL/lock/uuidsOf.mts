import { uuidOf } from './uuidOf.mjs'

/**
 * The ids in lower case, without duplicates, ascending (the order of the `uuid` type), or a `TypeError` that names the
 * argument by `label` and never quotes a value.
 */
export function uuidsOf(value: unknown, label: string): string[] {
	if (!Array.isArray(value)) throw new TypeError(`${label} must be an array of UUIDs`)
	const ids = (value as unknown[]).map((entry) => uuidOf(entry, `each entry of ${label}`))
	// eslint-disable-next-line sonarjs/no-alphabetical-sort -- ids are lower-case hex and dashes, so the default order by UTF-16 code unit is the order of the `uuid` type; localeCompare would depend on the host locale
	return [...new Set(ids)].sort()
}
