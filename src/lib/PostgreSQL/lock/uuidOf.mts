const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The id in lower case, or a `TypeError` that names the argument by `label` and never quotes the value. */
export function uuidOf(value: unknown, label: string): string {
	if (typeof value !== 'string' || !UUID.test(value)) {
		throw new TypeError(`${label} must be a UUID`)
	}
	return value.toLowerCase()
}
