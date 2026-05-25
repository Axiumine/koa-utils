import { throwMongoDBErrors } from '@lib/MongoDB/throwMongoErrors.mjs'

import { expectGraphQLError } from '../../helpers/assertGraphQLError.mjs'

describe('throwMongoDBErrors', () => {
	it('delegates to throwIfMongoErr for DuplicateKey (409)', () => {
		expectGraphQLError(
			() => throwMongoDBErrors({ errorResponse: { code: 11000 }, message: 'dup' } as never),
			409,
			'Conflict'
		)
	})

	it('throws 500 Internal Server Error when error not recognized', () => {
		expectGraphQLError(
			() => throwMongoDBErrors({ message: 'random failure' } as never),
			500,
			'Internal Server Error',
			'Error reported to Dev Team.'
		)
	})
})
