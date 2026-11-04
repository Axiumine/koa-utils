/** True for a string that is one of the listed words, compared as it is (case counts). */
export function isOneOf(list: readonly string[], value: unknown): value is string {
	return typeof value === 'string' && list.includes(value)
}
