/** A decimal string of up to 19 digits: what the driver hands over for a `bigint` column. */
const BIGINT_TEXT = /^\d{1,19}$/

/**
 * A version column value as text, or `undefined` when it is no version: a safe integer (`integer` columns arrive as
 * numbers) or a string of 1 to 19 digits (`bigint` columns arrive as decimal strings, which a number cannot hold exactly).
 */
export function versionText(value: unknown): string | undefined {
	if (typeof value === 'number') return Number.isSafeInteger(value) ? String(value) : undefined
	return typeof value === 'string' && BIGINT_TEXT.test(value) ? value : undefined
}
