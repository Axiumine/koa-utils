import * as Sentry from '@private/lib/sentry.mjs'
import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'
import { throwInternalError } from '@throw/throwInternalError.mjs'
import { GraphQLError } from 'graphql'

import { throwIfMongoErr } from './MongoDB/throwIfMongoErr.mjs'

export function tryCatchRethrow(e: GraphQLError | Error) {
	throwIfMongoErr(e)

	// else throw here
	if (e instanceof GraphQLError) {
		// The installed graphql types declare `extensions` as always present. Older majors left it undefined and the
		// peer range has no floor, so it is read as optional, through the shape this function relies on.
		const extensions = e.extensions as { http?: { status?: number }; description?: string } | undefined
		const status = extensions?.http?.status || 500
		const desc = extensions?.description || ''
		throw throwGraphQLError(status, e.message, desc)
	} else {
		Sentry.captureException(e)
		throw throwInternalError()
	}
}
