import { throwIfMongoErr } from '@lib/MongoDB/throwIfMongoErr.mjs'
import { expect } from 'chai'

import { expectGraphQLError } from '../../helpers/assertGraphQLError.mjs'

describe('throwIfMongoErr', () => {
	it('throws 409 Conflict for direct DuplicateKeyError (code 11000)', () => {
		expectGraphQLError(
			() => throwIfMongoErr({ errorResponse: { code: 11000 }, message: 'dup' } as never),
			409,
			'Conflict',
			'You have already done this.'
		)
	})

	it('throws 409 Conflict for nested parent.errorResponse.code = 11000', () => {
		expectGraphQLError(
			() => throwIfMongoErr({ parent: { errorResponse: { code: 11000 } }, message: 'dup' } as never),
			409,
			'Conflict',
			'You have already done this.'
		)
	})

	it('throws 400 Bad Request when message starts with [Validator]', () => {
		expectGraphQLError(
			() => throwIfMongoErr({ message: '[Validator] field bad' } as never),
			400,
			'Bad Request',
			'field bad'
		)
	})

	it('does nothing for unknown error', () => {
		expect(() => throwIfMongoErr({ message: 'random' } as never)).to.not.throw()
	})

	it('does nothing when errorResponse.code is not 11000', () => {
		expect(() =>
			throwIfMongoErr({ errorResponse: { code: 99 }, message: 'x' } as never)
		).to.not.throw()
	})
})
