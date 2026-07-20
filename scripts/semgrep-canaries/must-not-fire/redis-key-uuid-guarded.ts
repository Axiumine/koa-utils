// safe: uuid v4 format guard between header read and redis key
import { redisClient, isValidUuidV4 } from '../stub'
export async function ok(ctx: any) {
	const raw = ctx.request.header?.authorization
	if (!isValidUuidV4(raw.slice(7))) {
		throw new Error('bad token')
	}
	return redisClient.hGetAll(`${process.env.REDIS_KEY}access:${raw.slice(7)}`)
}
