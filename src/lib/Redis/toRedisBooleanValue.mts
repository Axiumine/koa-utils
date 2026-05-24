import { RedisBoolean } from './RedisBoolean.mjs'

export function toRedisBooleanValue(value: boolean) {
	return value ? RedisBoolean.true : RedisBoolean.false
}
