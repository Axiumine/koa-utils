import { IContextAuthenticatedResource } from '@context/IContextAuthenticatedResource.mjs'
import { redisClient } from '@dataSources/Redis.mjs'
import { isSessionBlocked } from '@lib/isSessionBlocked.mjs'
import { throwAccessTokenExpiredOrDeleted } from '@throw/throwAccessTokenExpiredOrDeleted.mjs'
import { throwAccessTokenRequired } from '@throw/throwAccessTokenRequired.mjs'
import { throwForbiddenError } from '@throw/throwForbiddenError.mjs'
import { throwPreconditionFailedNoAuthHeader } from '@throw/throwPreconditionFailedNoAuthHeader.mjs'
import * as dotenv from 'dotenv'
import { Next } from 'koa'
import { Types } from 'mongoose'

dotenv.config()

/**
 * Find out access token in Bearer header
 */
export const authenticatedResourceHandler = () => async (ctx: IContextAuthenticatedResource, next: Next) => {
	/***************************
	 * CLIENT:
	 * - in authorization: ctx.request.header.authorization =  'Bearer ACCESS_TOKEN
	 */

	const authorization = ctx.request.header?.authorization

	// more detailed errors code instead of generic 401 unauthorized (tampering)
	if (authorization === undefined) {
		throw throwPreconditionFailedNoAuthHeader()
	}
	if (!authorization.startsWith('Bearer access:')) {
		throw throwAccessTokenRequired()
	}

	const key = authorization.replace('Bearer ', '')

	// does the key access:xxx exist in Redis ? read Redis...
	const redSession = await redisClient.hGetAll(
		`${process.env.REDIS_KEY}${key}` // 'access:' present inside key
	)
	if (Object.keys(redSession).length !== 0) {
		const redData = { ...redSession } // For safety, Redis return an object without the default Object.prototype  in its prototype chain.
		// is the user reported as blocked within the session ? (see isSessionBlocked)
		if (isSessionBlocked(redData)) {
			throw throwForbiddenError()
		}

		ctx.state.user = {
			...redData,
			id: new Types.ObjectId(redData.id) // fix id as ObjectId
		}
	} else if (ctx.request.header?.['x-introspectioncode'] !== `${process.env.INTROSPECTION_CODE}`) {
		throw throwAccessTokenExpiredOrDeleted()
	} // else return next

	return next()
}
