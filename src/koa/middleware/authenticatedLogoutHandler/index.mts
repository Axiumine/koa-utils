import { IContextLogout } from '@context/IContextLogout.mjs'
import { IContextRefresh } from '@context/IContextRefresh.mjs'
import { redisClient } from '@dataSources/Redis.mjs'
import { isValidUuidV4 } from '@lib/isValidUuidV4.mjs'
import { verifyIntrospectionCode } from '@private/lib/verifyIntrospectionCode.mjs'
import { throwAlreadyDone } from '@throw/throwAlreadyDone.mjs'
import { throwPreconditionFailedNoAuthCookie } from '@throw/throwPreconditionFailedNoAuthCookie.mjs'
import { throwPreconditionFailedNoAuthHeader } from '@throw/throwPreconditionFailedNoAuthHeader.mjs'
import * as dotenv from 'dotenv'
import Keygrip from 'keygrip'
import { Next } from 'koa'

import { verifySignedRefreshToken } from '../authenticatedAuthorizationHandler/verifySignedRefreshToken.mjs'

dotenv.config()

const requireIntrospectionOrThrow = (header: IContextLogout['request']['header'], throwOnFail: () => never): true => {
	if (typeof header !== 'undefined' && verifyIntrospectionCode(header['x-introspectioncode'])) {
		return true
	}
	throw throwOnFail()
}

const extractBearerAccessToken = (authorization: string | undefined): string =>
	authorization?.startsWith('Bearer access:') && isValidUuidV4(authorization.slice('Bearer access:'.length))
		? authorization.replace('Bearer ', '')
		: ''

export const authenticatedLogoutHandler = (keys: Keygrip) => async (ctx: IContextLogout, next: Next) => {
	/***************************
	 * CLIENT:
	 * - in authorization: ctx.request.header.authorization = Bearer ACCESS_TOKEN_HERE
	 * - in cookie: ctx.request.header.cookie = refresh_cookie=TOKEN_HERE
	 */
	/*
	if (typeof ctx.request.header?.operation !== 'undefined') {
		const operationName = ctx.request.header.operation
		console.debug('[authorizationHandler] operationName: ', operationName)
	} */
	let introspection = false

	// refresh
	const cookie = ctx.request.header?.cookie // refresh
	if (typeof cookie === 'undefined') {
		introspection = requireIntrospectionOrThrow(ctx.request.header, throwPreconditionFailedNoAuthCookie)
	}

	const authorization = ctx.request.header?.authorization // access
	if (typeof authorization === 'undefined') {
		introspection = requireIntrospectionOrThrow(ctx.request.header, throwPreconditionFailedNoAuthHeader)
	}

	if (!introspection) {
		const refreshToken = verifySignedRefreshToken(ctx as unknown as IContextRefresh, keys)
		const redRefreshSession = await redisClient.hGet(`${process.env.REDIS_KEY}${refreshToken}`, 'id')
		if (redRefreshSession != null) {
			ctx.state = {
				user: {
					refreshToken: refreshToken
				}
			}
		} else {
			throw throwAlreadyDone()
		}

		// Access Token, optional
		// The 'Bearer access:' prefix must be checked before building the Redis key:
		// without this check the client controls the entire key and could reach refresh: entries.
		// The suffix is checked too: the prefix alone still leaves the rest of the key client-controlled.
		// Tokens with the wrong prefix, or a suffix that is not a v4 uuid, are ignored rather than
		// rejected: the access token remains optional here.
		const accessToken = extractBearerAccessToken(authorization)
		if (accessToken !== '') {
			const redAccessSession = await redisClient.hGet(`${process.env.REDIS_KEY}${accessToken}`, 'id') // 'access:' already present
			if (redAccessSession != null) {
				ctx.state.user.accessToken = accessToken
			} // else no problem, session could be expired
		}
	} // else introspection
	return next()
}
