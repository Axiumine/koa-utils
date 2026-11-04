const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The id in lower case, or a `TypeError` that names the argument by `label` and never quotes the value. */
export function uuidOf(value: unknown, label: string): string {
	// nosemgrep: ajinabraham.njsscan.dos.regex_dos.regex_dos -- UUID has only fixed-length groups and no unbounded quantifier, so it matches in linear time
	if (typeof value !== 'string' || !UUID.test(value)) {
		throw new TypeError(`${label} must be a UUID`)
	}
	return value.toLowerCase()
}
