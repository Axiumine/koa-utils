import { isRedisTlsRequired } from './isRedisTlsRequired.mjs'

/**
 * Returns the standalone-client connection URL, refusing a plaintext one when TLS is required.
 *
 * With `REDIS_TLS` off this is a pass-through: `REDIS_URL` reaches `createClient` untouched,
 * `undefined` included, exactly as before the flag existed.
 *
 * With `REDIS_TLS=true` the URL must carry the `rediss:` scheme; anything else throws here, at
 * module load of `dataSources/Redis.mts`, before a socket is ever opened. Fail-closed rather than a
 * silent upgrade to `rediss://`: rewriting the scheme under an operator who wrote `redis://` hides
 * the misconfiguration until the TLS handshake fails, against a host that may not be the intended
 * one. Refusing at load turns it into a single unmissable startup error instead.
 *
 * The scheme is read through `new URL()` rather than `startsWith`, so it is compared the way
 * node-redis compares it — `URL` lower-cases the protocol, which makes `REDISS://host:6379` a valid
 * TLS URL both here and in `RedisClient.parseURL`.
 */
export const resolveRedisUrl = (url: string | undefined): string | undefined => {
	if (!isRedisTlsRequired()) {
		return url
	}
	if (typeof url !== 'string' || url.length === 0) {
		throw new Error('[Redis] REDIS_TLS is enabled but REDIS_URL is not set — a rediss:// URL is required.')
	}

	let protocol: string
	try {
		protocol = new URL(url).protocol
	} catch {
		throw new Error('[Redis] REDIS_TLS is enabled but REDIS_URL is not a valid URL — a rediss:// URL is required.')
	}
	if (protocol !== 'rediss:') {
		throw new Error(`[Redis] REDIS_TLS is enabled but REDIS_URL uses scheme "${protocol}" — rediss:// required.`)
	}

	return url
}
