import { IMariaDbErr } from '@lib/MariaDB/IMariaDBErr.mjs'
import { throwErrorWrongUserInput } from '@throw/throwErrorWrongUserInput.mjs'
import { throwInternalError } from '@throw/throwInternalError.mjs'

import { MariaDBErrType } from './MariaDBErrType.mjs'

export function throwSqlErrors(e: IMariaDbErr) {
	if (e.parent && e.parent.sqlMessage && e.parent.code === MariaDBErrType.ER_DATA_TOO_LONG) {
		const err = e.parent.sqlMessage.replace(' column', '')

		// Find the index of the first occurrence of the single quote
		const firstQuoteIndex = err.indexOf("'")
		// Find the index of the second occurrence of the single quote, starting the search just after the first quote
		const secondQuoteIndex = err.indexOf("'", firstQuoteIndex + 1)
		// Extract the substring from the start of the string to just after the second single quote
		const errorMessage = err.substring(0, secondQuoteIndex + 1)

		throw throwErrorWrongUserInput(errorMessage)
	} else {
		// @todo report to Sentry
		throw throwInternalError()
	}
}
