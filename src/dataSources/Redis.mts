import { isRedisTlsRequired } from '@private/dataSources/isRedisTlsRequired.mjs'
import { redisNodeUrl } from '@private/dataSources/redisNodeUrl.mjs'
import { resolveRedisUrl } from '@private/dataSources/resolveRedisUrl.mjs'
import * as Sentry from '@sentry/node'
import * as dotenv from 'dotenv'
import { createClient, createCluster } from 'redis'

dotenv.config()

export const redisClient =
	process.env.REDIS_IS_CLUSTER === '1'
		? /* c8 ignore start -- cluster branch: requires REDIS_IS_CLUSTER=1 + 3 redis nodes, not in unit env */
			createCluster({
				rootNodes: [
					{ url: redisNodeUrl(process.env.REDIS_DB1_HOST, process.env.REDIS_DB1_PORT) },
					{ url: redisNodeUrl(process.env.REDIS_DB2_HOST, process.env.REDIS_DB2_PORT) },
					{ url: redisNodeUrl(process.env.REDIS_DB3_HOST, process.env.REDIS_DB3_PORT) }
				],
				defaults: {
					username: process.env.REDIS_USERNAME,
					password: process.env.REDIS_PASSWORD,
					// rootNodes only carry the topology-discovery connections; node-redis does not inherit their
					// TLS setting for the connections it then opens to the discovered nodes. Without this the
					// rediss:// scheme above would be a no-op and every real cluster connection would stay
					// plaintext. See the rootNodes JSDoc in @redis/client's cluster/index.d.ts.
					socket: isRedisTlsRequired() ? { tls: true } : { tls: false }
				}
			})
		: /* c8 ignore stop */
			createClient({ url: resolveRedisUrl(process.env.REDIS_URL) })

export const RedisConnect = async () => {
	console.info('[Redis] Try connect to database... ')

	redisClient.on('error', (e) => {
		console.error('Redis Client Error')
		Sentry.captureException(e)
	})
	await redisClient.connect()
	console.info('[Redis] OK: Redis connection has been established successfully. ')
}

export async function RedisDisconnect() {
	console.info('[Redis] Try close connection to database... ')
	try {
		await redisClient.close() // Gracefully close a client's connection to Redis
		console.info('[Redis] OK: Redis connection has been closed successfully.')
	} catch (e) {
		if (e instanceof Error && e.message === 'The client is closed') {
			console.info('[Redis] Client was already closed')
			return // Continue execution if client is already closed
		}
		// For any other errors, log and re-throw
		console.error('[Redis] Error during disconnection')
		Sentry.captureException(e)
		throw e
	}
}
