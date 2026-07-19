import { IContextKoaErrorHandler } from '@context/IContextKoaErrorHandler.mjs'
import * as Sentry from '@sentry/node'
import * as dotenv from 'dotenv'
import { GraphQLError } from 'graphql'
import { Next } from 'koa'

import { IKoaError } from './IKoaError.mjs'

dotenv.config()

// check status
function resolveErrorStatus(errKoa: IKoaError, isIstanceOfGQL: boolean): number {
	if (isIstanceOfGQL) {
		return errKoa.extensions?.http?.status || 500
	}
	return errKoa.status || 500
}

/**
 * do not set body for status codes that do not allow it
 */
function buildErrorBody(
	errKoa: IKoaError,
	isIstanceOfGQL: boolean,
	status: number
): IContextKoaErrorHandler['body'] | undefined {
	const allowBody = ![100, 101, 102, 204, 205, 304].includes(status)

	if (!allowBody) {
		return undefined
	}

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
	if (process.env.NODE_ENV === 'development') {
		if (!isIstanceOfGQL) {
			Sentry.captureException(errKoa)
		}
	}
}

export async function tdwKoaErrorHandler(ctx: IContextKoaErrorHandler, next: Next) {
	try {
		await next()
	} catch (err: unknown) {
		const errKoa = err as IKoaError
		const isIstanceOfGQL = err instanceof GraphQLError

		ctx.status = resolveErrorStatus(errKoa, isIstanceOfGQL)

		const body = buildErrorBody(errKoa, isIstanceOfGQL, ctx.status)
		if (body) {
			ctx.body = body
		}

		maybeCaptureSentryError(errKoa, isIstanceOfGQL)

		ctx.app.emit('error', errKoa, ctx)
	}
}
