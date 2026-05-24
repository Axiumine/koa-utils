import { IContextKoaErrorHandler } from '@context/IContextKoaErrorHandler.mjs'
import * as Sentry from '@sentry/node'
import * as dotenv from 'dotenv'
import { GraphQLError } from 'graphql'
import { Next } from 'koa'

import { IKoaError } from './IKoaError.mjs'

dotenv.config()

export async function tdwKoaErrorHandler(ctx: IContextKoaErrorHandler, next: Next) {
	try {
		await next()
	} catch (err: unknown) {
		const errKoa = err as IKoaError
		const isIstanceOfGQL = err instanceof GraphQLError

		// check status
		if (isIstanceOfGQL) {
			ctx.status = errKoa.extensions?.http?.status || 500
		} else {
			ctx.status = errKoa.status || 500
		}

		/**
		 * do not set body for status codes that do not allow it
		 */
		const allowBody = ![100, 101, 102, 204, 205, 304].includes(ctx.status)

		if (allowBody) {
			ctx.body = {
				message: errKoa.message
			}
			if (isIstanceOfGQL) {
				ctx.body.description = errKoa.extensions?.description || ''
			}
		}

		// more debug data ?
		if (process.env.NODE_ENV === 'development') {
			if (!isIstanceOfGQL) {
				Sentry.captureException(errKoa)
			}
		}

		ctx.app.emit('error', errKoa, ctx)
	}
}
