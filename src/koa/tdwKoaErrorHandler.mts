import { IContextKoaErrorHandler } from '@context/IContextKoaErrorHandler.mjs'
import { loadEnv } from '@private/lib/loadEnv.mjs'
import * as Sentry from '@private/lib/sentry.mjs'
import { GraphQLError } from 'graphql'
import { Next } from 'koa'

import { createKoaErrorHandler } from './createKoaErrorHandler.mjs'
import { IKoaError } from './IKoaError.mjs'

loadEnv()

// check status
function resolveErrorStatus(errKoa: IKoaError, isIstanceOfGQL: boolean): number {
	if (isIstanceOfGQL) {
		return errKoa.extensions?.http?.status || 500
	}
	return errKoa.status || 500
}

/**
 * the factory skips this for status codes that do not allow a body
 */
function buildErrorBody(errKoa: IKoaError, isIstanceOfGQL: boolean): IContextKoaErrorHandler['body'] {
	const body: IContextKoaErrorHandler['body'] = {
		message: errKoa.message
	}
	if (isIstanceOfGQL) {
		body.description = errKoa.extensions?.description || ''
	}
	return body
}

// more debug data ?
function maybeCaptureSentryError(errKoa: IKoaError, isIstanceOfGQL: boolean): void {
	if (process.env['NODE_ENV'] === 'development') {
		if (!isIstanceOfGQL) {
			Sentry.captureException(errKoa)
		}
	}
}

const handle = createKoaErrorHandler<IContextKoaErrorHandler>({
	statusOf: (err) => resolveErrorStatus(err as IKoaError, err instanceof GraphQLError),
	bodyOf: (err) => buildErrorBody(err as IKoaError, err instanceof GraphQLError),
	report: (err) => {
		maybeCaptureSentryError(err as IKoaError, err instanceof GraphQLError)
	}
})

// Not async: returns the factory's promise as is, so there is no extra microtask tick. Name and length (2) stay as before.
export function tdwKoaErrorHandler(ctx: IContextKoaErrorHandler, next: Next): Promise<void> {
	return handle(ctx, next)
}
