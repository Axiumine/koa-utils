import { redisClient } from '@dataSources/Redis.mjs'
import { REFRESH_TOKEN_EXPIRY } from '@lib/tokens.mjs'
import * as Sentry from '@sentry/node'
import { throwInternalError } from '@throw/throwInternalError.mjs'
import * as dotenv from 'dotenv'
import { Types } from 'mongoose'

dotenv.config()

export async function setRedisLoginSession(id: Types.ObjectId, accessToken: string, accTokenExp: number, refreshToken: string) {
	const keyDataAccess = { id: id.toString() }
	const keyDataRefresh = { ...keyDataAccess, access: accessToken }

	const keyAccess = `${process.env.REDIS_KEY}access:${accessToken}`
	const keyRefresh = `${process.env.REDIS_KEY}refresh:${refreshToken}`

	try {
		// Store session in Redis
		await Promise.all([
			redisClient.hSet(keyAccess, keyDataAccess),
			redisClient.hSet(keyRefresh, keyDataRefresh) // 90 days
		])

		await Promise.all([redisClient.expire(keyAccess, accTokenExp), redisClient.expire(keyRefresh, REFRESH_TOKEN_EXPIRY)])
	} catch (e) {
		// delete keys
		await Promise.all([redisClient.del(keyAccess), redisClient.del(keyRefresh)])
		Sentry.captureException(e)
		throw throwInternalError()
	}
}
