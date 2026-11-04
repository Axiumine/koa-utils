import { readField } from '@private/lib/PostgreSQL/readField.mjs'

/** A SQLSTATE is five characters of digits and upper-case letters; anything else is not logged. */
const SQLSTATE = /^[0-9A-Z]{5}$/

/**
 * The SQLSTATE of an error from the driver, or `undefined` for anything that has no safe five-character `code`.
 * The message, the `detail` (which quotes the failing row), the `query` and the `parameters` are never read.
 */
export function sqlstateOf(error: unknown): string | undefined {
	const code = readField(error, 'code')
	return typeof code === 'string' && SQLSTATE.test(code) ? code : undefined
}
