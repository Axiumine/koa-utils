import { readField } from '@private/lib/PostgreSQL/readField.mjs'

/**
 * A name the server gave to a constraint or an index: at most 63 bytes (the identifier limit), and here letters,
 * digits, `_` and `$` only. A name outside that shape is a quoted identifier with something unusual in it; it is
 * neither looked up nor logged.
 */
const SAFE_NAME = /^[A-Za-z0-9_$]{1,63}$/

/**
 * The name of the constraint that a violation names (the `constraint` field of the driver error), or `undefined` when
 * there is none or when it is not a plain identifier. For the violation of a unique index that backs no constraint,
 * the server puts the name of the index there.
 */
export function constraintNameOf(error: unknown): string | undefined {
	const name = readField(error, 'constraint')
	return typeof name === 'string' && SAFE_NAME.test(name) ? name : undefined
}
