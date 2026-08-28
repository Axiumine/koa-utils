import { isRedisTlsRequired } from './isRedisTlsRequired.mjs'

/**
 * Builds one cluster root-node URL — `redis://host:port`, or `rediss://host:port` when
 * `isRedisTlsRequired()`.
 *
 * This lives in its own module so the scheme choice stays unit-tested. Its only call site is the
 * `createCluster` arm of `dataSources/Redis.mts`, which is `c8 ignore`d wholesale because it needs
 * `REDIS_IS_CLUSTER=1` plus three live nodes; interpolating the scheme inline there would park the
 * one security-relevant decision of that arm outside coverage.
 *
 * `host` and `port` are interpolated exactly as the previous inline template did, `undefined`
 * included — an unset `REDIS_DB1_HOST` still yields the literal `'undefined'` in the URL. Validating
 * them is out of scope here and intentionally unchanged.
 */
export const redisNodeUrl = (host: string | undefined, port: string | undefined): string =>
	`${isRedisTlsRequired() ? 'rediss' : 'redis'}://${host}:${port}`
