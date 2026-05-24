import { IContextLogout } from '@context/IContextLogout.mjs'
import { redisClient } from '@dataSources/Redis.mjs'
import { refreshTokenOptions } from '@lib/tokenOptions.mjs'
import * as Sentry from '@sentry/node'
import * as dotenv from 'dotenv'
import { GraphQLBoolean, GraphQLNonNull } from 'graphql'

dotenv.config()

export const logout = {
	description: 'logout',
	type: new GraphQLNonNull(GraphQLBoolean),
	async resolve(_: unknown, {}, ctx: IContextLogout) {
		try {
			// elimina access token usato per fare questa chiamata
			// e se esiste ancora, anche il refresh token

			await redisClient.del(
				`${process.env.REDIS_KEY}refresh:${ctx.state.user.refreshToken}`
			)

			if ((ctx.state.user?.accessToken || '') !== '') {
				await redisClient.del(
					`${process.env.REDIS_KEY}access:${ctx.state.user.accessToken}`
				)
			}

			// delete cookies
			ctx.cookies.set('refresh_token', '', refreshTokenOptions)
		} catch (e) {
			// ignore errors
			Sentry.captureException(e)
		}

		return true
	}
}
