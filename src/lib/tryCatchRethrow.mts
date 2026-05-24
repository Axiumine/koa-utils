import * as Sentry from '@sentry/node'
import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'
import { throwInternalError } from '@throw/throwInternalError.mjs'
import { GraphQLError } from 'graphql'

import { throwIfMongoErr } from './MongoDB/throwIfMongoErr.mjs'

export function tryCatchRethrow(e: GraphQLError | Error) {
	throwIfMongoErr(e)

	// else throw here
	if (e instanceof GraphQLError) {
		// @ts-expect-error status do not exist
		const status = e.extensions?.http?.status || 500
		const desc = (e.extensions?.description as string) || ''
		throw throwGraphQLError(status, e.message, desc)
	} else {
		Sentry.captureException(e)
		throw throwInternalError()
	}
}
