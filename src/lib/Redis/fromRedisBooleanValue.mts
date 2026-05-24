import { RedisBoolean } from './RedisBoolean.mjs'

export function fromRedisBooleanValue(data: RedisBoolean) {
	return data === RedisBoolean.true
}
