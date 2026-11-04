/** A catalog flag. Only a real boolean counts; anything else is a malformed answer, never a pass. */
export function catalogFlag(value: unknown): boolean {
	if (typeof value !== 'boolean') throw new TypeError('the catalog answered a value of another type')
	return value
}
