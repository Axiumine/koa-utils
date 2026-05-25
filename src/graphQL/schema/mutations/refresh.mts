import { IContextRefresh } from '@context/IContextRefresh.mjs'
import { redisClient } from '@dataSources/Redis.mjs'
import { setLoginCookies } from '@lib/setLoginCookies.mjs'
import { accessTokenExpiry, generateAccessToken, generateRefreshToken, REFRESH_TOKEN_EXPIRY } from '@lib/tokens.mjs'
import { tryCatchRethrow } from '@lib/tryCatchRethrow.mjs'
import * as Sentry from '@sentry/node'
import { RefreshType } from '@stypes/RefreshType.mjs'
import * as dotenv from 'dotenv'
import { GraphQLError, GraphQLNonNull } from 'graphql'

dotenv.config()

export const refresh = {
	description: 'refresh token',
	type: new GraphQLNonNull(RefreshType),
	async resolve(_: unknown, {}, ctx: IContextRefresh) {
		// console.debug('refresh')
		let status = false // default

		// ha il refresh token, access token già scaduto

		// prende id dell'utente già copiato in ctx
		const userId = ctx.state.user.id.toString()

		// genera i 2 nuovi token
		let accessToken = generateAccessToken()
		let refreshToken = generateRefreshToken()
		const keyAccess = `${process.env.REDIS_KEY}access:${accessToken}`
		const keyRefresh = `${process.env.REDIS_KEY}refresh:${refreshToken}`

		let accessTokenData = ctx.state.user
		const oldRefresh = ctx.state.user.refreshToken
		// @ts-expect-error delete refresh
		delete accessTokenData.refreshToken

		const refreshTokenData = { id: userId }

		try {
			// Store session in Redis
			await Promise.all([
				redisClient.hSet(keyAccess, accessTokenData as unknown as Record<string, string>),
				redisClient.hSet(keyRefresh, refreshTokenData as unknown as Record<string, string>)
			])

			// set expiry
			const accTokenExp = accessTokenExpiry()
			await Promise.all([redisClient.expire(keyAccess, accTokenExp), redisClient.expire(keyRefresh, REFRESH_TOKEN_EXPIRY)])

			setLoginCookies(ctx, refreshToken)

			// elimina refresh token usato per fare questa chiamata
			await redisClient.del(`${process.env.REDIS_KEY}${oldRefresh}`)

			status = true
		} catch (e: unknown) {
			Sentry.captureException(e)
			// delete keys
			await Promise.all([redisClient.del(keyAccess), redisClient.del(keyRefresh)])
			accessToken = ''
			tryCatchRethrow(e as GraphQLError | Error)
		}

		return {
			status,
			accessToken
		}
	}
}
