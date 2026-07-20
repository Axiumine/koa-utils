// expect: koa-utils.redis-injection.key-injection
import { redisClient } from '../stub'
export async function bad(ctx: any) {
	const raw = ctx.request.header?.authorization
	const token = raw.slice(7)
	return redisClient.hGetAll(`${process.env.REDIS_KEY}access:${token}`)
}
