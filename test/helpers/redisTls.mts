/**
 * Save/restore helpers for process.env.REDIS_TLS.
 *
 * Same coercion trap as `nodeEnv.mts` / `introspectionCode.mts`: `process.env.REDIS_TLS = undefined`
 * store literal string 'undefined', never clear var. Spec saving originally-unset REDIS_TLS then
 * restoring naively leave REDIS_TLS='undefined' behind for every later spec file in the mocha run.
 *
 * Load-bearing beyond tidiness here. `dist/dataSources/Redis.mjs` call `resolveRedisUrl` at module
 * load, and that fn throw when REDIS_TLS='true' + REDIS_URL not rediss. A leaked 'true' from an
 * earlier spec file therefore does not merely skew an assert — it abort the import of Redis.mjs for
 * every later spec touching auth middleware, mutations or the login session write.
 */
export const saveRedisTls = (): string | undefined => process.env.REDIS_TLS

export const restoreRedisTls = (saved: string | undefined): void => {
	if (typeof saved === 'undefined') {
		delete process.env.REDIS_TLS
	} else {
		process.env.REDIS_TLS = saved
	}
}
