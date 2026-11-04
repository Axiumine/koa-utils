import { DbConnectError } from '@lib/PostgreSQL/error/DbConnectError.mjs'
import type { IRoleAssertionSubject } from '@lib/PostgreSQL/error/IRoleAssertionSubject.mjs'

import { readField } from './readField.mjs'

/**
 * What a failure that is not an assertion contributes to the `CHECK_FAILED` error: the closed reason of a refused
 * connection, or the driver's own `code` when it is a string, as the `code` of the subject; an empty subject for
 * anything else. `RoleAssertionError` keeps the code only if it is short and made of letters, digits and underscores.
 */
export function roleFailureSubject(error: unknown): IRoleAssertionSubject {
	const code = error instanceof DbConnectError ? error.reason : readField(error, 'code')
	return typeof code === 'string' ? { code } : {}
}
