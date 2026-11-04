/** A plain unqualified identifier: a letter or `_`, then letters, digits, `_` or `$`, at most 63 characters (the limit of the server). */
const NAME = /^[A-Za-z_][\w$]{0,62}$/

/** True for a string that is a plain identifier. Quotes, dots, spaces and every other character are refused. */
export function isRoleName(value: unknown): value is string {
	return typeof value === 'string' && NAME.test(value)
}
