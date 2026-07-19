import { IContextLogout } from '@context/IContextLogout.mjs'
import { redisClient } from '@dataSources/Redis.mjs'
import { buildPrefixedRedisKey } from '@lib/Redis/buildPrefixedRedisKey.mjs'
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
			// delete the access token used to make this call
			// and, if it still exists, the refresh token too
			// buildPrefixedRedisKey is idempotent: the tokens are already prefixed when ctx.state.user
			// comes from authenticatedLogoutHandler, so re-adding the prefix here would delete
			// 'refresh:refresh:<uuid>' — a key that was never written — and leave the session alive

			await redisClient.del(`${process.env.REDIS_KEY}${buildPrefixedRedisKey('refresh:', ctx.state.user.refreshToken)}`)

			const accessToken = ctx.state.user?.accessToken || ''
			if (accessToken !== '') {
				await redisClient.del(`${process.env.REDIS_KEY}${buildPrefixedRedisKey('access:', accessToken)}`)
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
