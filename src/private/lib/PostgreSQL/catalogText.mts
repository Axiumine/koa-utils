/** A catalog value that must be text. Anything else is a malformed answer and throws. */
export function catalogText(value: unknown): string {
	if (typeof value !== 'string') throw new TypeError('the catalog answered a value of another type')
	return value
}
