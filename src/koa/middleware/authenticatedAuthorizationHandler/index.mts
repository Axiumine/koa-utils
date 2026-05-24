import { IContextRefresh } from '@context/IContextRefresh.mjs'
import { redisClient } from '@dataSources/Redis.mjs'
import { throwForbiddenError } from '@throw/throwForbiddenError.mjs'
import { throwRefreshTokenExpiredOrDeleted } from '@throw/throwRefreshTokenExpiredOrDeleted.mjs'
import * as dotenv from 'dotenv'
import Keygrip from 'keygrip'
import { Next } from 'koa'
import { Types } from 'mongoose'

import { verifySignedRefreshToken } from './verifySignedRefreshToken.mjs'

dotenv.config()

export const authenticatedAuthorizationHandler =
	(keys: Keygrip) => async (ctx: IContextRefresh, next: Next) => {
		// console.debug('[authorizationHandler] ')

		/***************************
		 * CLIENT:
		 * - invia opaque token come cookie
		 */

		// la chiave esiste in redis ? ok, read redis
		const refreshTokenRedis = verifySignedRefreshToken(ctx, keys)
		const redSession = await redisClient.hGetAll(`${process.env.REDIS_KEY}${refreshTokenRedis}`)
		if (Object.keys(redSession).length !== 0) {
			const redData = { ...redSession } // For safety, Redis return an object without the default Object.prototype  in its prototype chain.

			// user è riportato come bloccato dentro alla sessione ?
			// da usare per bloccare l'accesso all'utente, invece di eliminare il token, impostare questo flag da pannello di controllo
			if (redData?.disabled || redData?.deleted) {
				throw throwForbiddenError()
			}
			ctx.state.user = {
				...redData,
				id: new Types.ObjectId(redData.id),
				refreshToken: refreshTokenRedis
			}
		} else if (ctx.request.header?.['x-introspectioncode'] !== `${process.env.INTROSPECTION_CODE}`) {
			throw throwRefreshTokenExpiredOrDeleted()
		} // else return next()

		return next()
	}

