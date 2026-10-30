import { tryCatchRethrow } from '@lib/tryCatchRethrow.mjs'
import { expect } from 'chai'
import { GraphQLError } from 'graphql'

import { expectGraphQLError } from '../helpers/assertGraphQLError.mjs'
import { startSentryCapture } from '../helpers/sentryEventCapture.mjs'

// NOTE: Sentry.captureException not stubbable (ESM non-writable export).
// No init → no-op → assert the rethrow only.

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

	it('falls back to status 500 when a GraphQLError-derived object has no extensions at all', () => {
		// optional chaining guard: instanceof pass for prototype-only object, extensions undefined
		const bare = Object.assign(Object.create(GraphQLError.prototype) as GraphQLError, { message: 'Bare' })
		expectGraphQLError(() => tryCatchRethrow(bare), 500, 'Bare', '')
	})

	it('reports unknown plain Error to Sentry then throws 500 internal', async () => {
		const capture = startSentryCapture()
		const boom = new Error('boom')
		try {
			expectGraphQLError(
				() => tryCatchRethrow(boom),
				500,
				'Internal Server Error',
				'Error reported to Dev Team.'
			)
		} finally {
			await capture.stop()
		}
		expect(capture.events).to.have.length(1)
		expect(capture.events[0]?.exception?.values?.[0]).to.deep.include({ type: 'Error', value: 'boom' })
	})

	it('does not report a GraphQLError to Sentry', async () => {
		const capture = startSentryCapture()
		try {
			expectGraphQLError(() => tryCatchRethrow(new GraphQLError('Known')), 500, 'Known', '')
		} finally {
			await capture.stop()
		}
		expect(capture.events).to.have.length(0)
	})
})
