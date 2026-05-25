import { tryCatchRethrow } from '@lib/tryCatchRethrow.mjs'
import { GraphQLError } from 'graphql'

import { expectGraphQLError } from '../helpers/assertGraphQLError.mjs'

// NOTE: Sentry.captureException cannot be stubbed (ESM non-writable export).
// Without init, captureException is a no-op, so we only assert the rethrow.

describe('tryCatchRethrow', () => {
	it('forwards DuplicateKey to throwIfMongoErr (409)', () => {
		expectGraphQLError(
			() =>
				tryCatchRethrow({
					errorResponse: { code: 11000 },
					message: 'dup'
				} as never),
			409,
			'Conflict'
		)
	})

	it('forwards [Validator] message to 400', () => {
		expectGraphQLError(
			() => tryCatchRethrow({ message: '[Validator] bad field' } as never),
			400,
			'Bad Request',
			'bad field'
		)
	})

	it('rebuilds GraphQLError preserving status + description', () => {
		const original = new GraphQLError('Custom Title', {
			extensions: { http: { status: 418 }, description: 'teapot' }
		})
		expectGraphQLError(() => tryCatchRethrow(original), 418, 'Custom Title', 'teapot')
	})

	it('falls back to status 500 when GraphQLError has no http extension', () => {
		const original = new GraphQLError('NoExt')
		expectGraphQLError(() => tryCatchRethrow(original), 500, 'NoExt', '')
	})

	it('reports unknown plain Error to Sentry then throws 500 internal', () => {
		expectGraphQLError(
			() => tryCatchRethrow(new Error('boom')),
			500,
			'Internal Server Error',
			'Error reported to Dev Team.'
		)
	})
})
