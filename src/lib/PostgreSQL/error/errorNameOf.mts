import { readField } from '@private/lib/PostgreSQL/readField.mjs'

/** A plain identifier of at most 40 characters, starting with a letter. */
const CLASS_NAME = /^[A-Za-z]\w{0,39}$/

/**
 * A short name for the class of an error, for a log line: the `name` property when it is a plain identifier of at most
 * 40 characters (`TypeError`, `DbConnectError`), else `undefined`. Never the message.
 */
export function errorNameOf(error: unknown): string | undefined {
	const name = readField(error, 'name')
	return typeof name === 'string' && CLASS_NAME.test(name) ? name : undefined
}
