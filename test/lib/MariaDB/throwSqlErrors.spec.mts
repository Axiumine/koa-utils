import { MariaDBErrType } from '@lib/MariaDB/MariaDBErrType.mjs'
import { throwSqlErrors } from '@lib/MariaDB/throwSqlErrors.mjs'

import { expectGraphQLError } from '../../helpers/assertGraphQLError.mjs'

describe('throwSqlErrors', () => {
	it('maps ER_DATA_TOO_LONG to 400 Bad Request with column-name slice', () => {
		const err = {
			parent: {
				code: MariaDBErrType.ER_DATA_TOO_LONG,
				sqlMessage: "Data too long for column 'username' at row 1"
			}
		}
		expectGraphQLError(
			() => throwSqlErrors(err),
			400,
			'Bad Request',
			"Data too long for 'username'"
		)
	})

	it('throws 500 Internal Server Error for unrecognized error', () => {
		expectGraphQLError(
			() => throwSqlErrors({ parent: { code: 'ER_OTHER', sqlMessage: 'x' } }),
			500,
			'Internal Server Error',
			'Error reported to Dev Team.'
		)
	})

	it('throws 500 when no parent set', () => {
		expectGraphQLError(
			() => throwSqlErrors({}),
			500,
			'Internal Server Error'
		)
	})
})
