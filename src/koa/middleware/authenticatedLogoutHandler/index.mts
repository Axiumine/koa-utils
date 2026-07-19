import { IContextLogout } from '@context/IContextLogout.mjs'
import { IContextRefresh } from '@context/IContextRefresh.mjs'
import { redisClient } from '@dataSources/Redis.mjs'
import { throwAlreadyDone } from '@throw/throwAlreadyDone.mjs'
import { throwPreconditionFailedNoAuthCookie } from '@throw/throwPreconditionFailedNoAuthCookie.mjs'
import { throwPreconditionFailedNoAuthHeader } from '@throw/throwPreconditionFailedNoAuthHeader.mjs'
import * as dotenv from 'dotenv'
import Keygrip from 'keygrip'
import { Next } from 'koa'

import { verifySignedRefreshToken } from '../authenticatedAuthorizationHandler/verifySignedRefreshToken.mjs'

dotenv.config()

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
		if (
			typeof ctx.request.header !== 'undefined' &&
			ctx.request.header['x-introspectioncode'] === `${process.env.INTROSPECTION_CODE}`
		) {
			introspection = true
		} else {
			throw throwPreconditionFailedNoAuthCookie()
		}
	}

	const authorization = ctx.request.header?.authorization // access
	if (typeof authorization === 'undefined') {
		if (
			typeof ctx.request.header !== 'undefined' &&
			ctx.request.header['x-introspectioncode'] === `${process.env.INTROSPECTION_CODE}`
		) {
			introspection = true
		} else {
			throw throwPreconditionFailedNoAuthHeader()
		}
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
		// Il prefisso 'Bearer access:' va verificato prima di costruire la chiave Redis:
		// senza controllo il client decide l'intera chiave e puo' raggiungere le voci refresh:.
		// Token con prefisso errato vengono ignorati, non rifiutati: l'access token resta opzionale.
		const accessToken = authorization?.startsWith('Bearer access:') ? authorization.replace('Bearer ', '') : ''
		if (accessToken !== '') {
			const redAccessSession = await redisClient.hGet(`${process.env.REDIS_KEY}${accessToken}`, 'id') // 'access:' already present
			if (redAccessSession != null) {
				ctx.state.user.accessToken = accessToken
			} // else no problem, session could be expired
		}
	} // else introspection
	return next()
}
