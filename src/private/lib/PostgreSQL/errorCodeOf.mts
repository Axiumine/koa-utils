import { readField } from './readField.mjs'

/** A short code of an error (`ECONNREFUSED`, `28P01`), or `undefined` when it has no string `code`. */
export function errorCodeOf(error: unknown): string | undefined {
	const code = readField(error, 'code')
	return typeof code === 'string' ? code : undefined
}
