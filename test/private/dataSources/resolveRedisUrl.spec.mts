/**
 * Tests for private/dataSources/resolveRedisUrl.mts
 *
 * Chain: resolveRedisUrl(url) → isRedisTlsRequired() gate → pass-through when off → else require a
 * parsable URL whose protocol is exactly 'rediss:' → return url, or throw.
 *
 * Two properties pinned, both security-relevant, both stated in full because a compressed version
 * reads as ambiguous.
 *
 * First: with the flag off the function must be a pure pass-through. It returns `REDIS_URL`
 * untouched, `undefined` and malformed values included, because every deployment that predates the
 * flag reaches `createClient` through this call and must keep booting exactly as it did before.
 *
 * Second: with the flag on the function must throw rather than upgrade the scheme. A silent rewrite
 * of `redis://` to `rediss://` would hide the misconfiguration until the TLS handshake failed, so
 * the specs below assert that a plaintext URL throws and that the returned value is never a rewritten
 * string.
 *
 * Throw asserts match on message content, not merely on "throws": the 3 refusal paths — unset URL,
 * unparsable URL, wrong scheme — carry distinct messages, and an operator reading a startup crash
 * needs the right one.
 */
import { resolveRedisUrl } from '@private/dataSources/resolveRedisUrl.mjs'
import { expect } from 'chai'

import { restoreRedisTls, saveRedisTls } from '../../helpers/redisTls.mjs'

// ---------------------------------------------------------------------------

describe('resolveRedisUrl', () => {
	let savedTls: string | undefined

	beforeEach(() => {
		savedTls = saveRedisTls()
	})

	afterEach(() => {
		restoreRedisTls(savedTls)
	})

	describe('REDIS_TLS off — pass-through', () => {
		beforeEach(() => {
			delete process.env.REDIS_TLS
		})

		it('returns a plaintext redis:// URL untouched', () => {
			expect(resolveRedisUrl('redis://cache.internal:6379')).to.equal('redis://cache.internal:6379')
		})

		it('returns a rediss:// URL untouched', () => {
			expect(resolveRedisUrl('rediss://cache.internal:6379')).to.equal('rediss://cache.internal:6379')
		})

		it('returns undefined untouched, never a substituted default', () => {
			// createClient({ url: undefined }) fall back to its own localhost default. Pre-flag
			// behaviour, must survive.
			expect(resolveRedisUrl(undefined)).to.equal(undefined)
		})

		it('returns an unparsable value untouched instead of validating it', () => {
			// Validation is scoped to the TLS gate. Off, this fn add no new failure mode.
			expect(resolveRedisUrl('not a url')).to.equal('not a url')
		})

		it('passes through when REDIS_TLS is set to a value that is not exactly "true"', () => {
			process.env.REDIS_TLS = 'TRUE'

			expect(resolveRedisUrl('redis://cache.internal:6379')).to.equal('redis://cache.internal:6379')
		})
	})

	describe('REDIS_TLS=true — rediss:// required', () => {
		beforeEach(() => {
			process.env.REDIS_TLS = 'true'
		})

		it('returns a rediss:// URL unchanged', () => {
			expect(resolveRedisUrl('rediss://cache.internal:6379')).to.equal('rediss://cache.internal:6379')
		})

		it('accepts an upper-case REDISS:// scheme', () => {
			// new URL() lower-case protocol, and node-redis RedisClient.parseURL compare it the same
			// way. Rejecting here would refuse a URL the client itself accept as TLS.
			expect(resolveRedisUrl('REDISS://cache.internal:6379')).to.equal('REDISS://cache.internal:6379')
		})

		it('throws on a plaintext redis:// URL, naming the scheme it found', () => {
			expect(() => resolveRedisUrl('redis://cache.internal:6379')).to.throw(
				'[Redis] REDIS_TLS is enabled but REDIS_URL uses scheme "redis:" — rediss:// required.'
			)
		})

		it('does not upgrade a plaintext URL to rediss://', () => {
			// Regression guard on the fail-closed decision. A coercing impl would return a rewritten
			// string here and every assert above would still pass.
			let returned: string | undefined = 'sentinel'
			try {
				returned = resolveRedisUrl('redis://cache.internal:6379')
			} catch {
				returned = 'threw'
			}

			expect(returned).to.equal('threw')
		})

		it('throws on any other scheme', () => {
			for (const url of ['http://cache.internal:6379', 'unix:///var/run/redis.sock']) {
				expect(() => resolveRedisUrl(url), url).to.throw('rediss:// required.')
			}
		})

		it('throws when REDIS_URL is unset', () => {
			expect(() => resolveRedisUrl(undefined)).to.throw(
				'[Redis] REDIS_TLS is enabled but REDIS_URL is not set — a rediss:// URL is required.'
			)
		})

		it('throws when REDIS_URL is an empty string', () => {
			// Empty string reach new URL() as a TypeError, but the operator-facing cause is a missing
			// variable, so it take the unset message.
			expect(() => resolveRedisUrl('')).to.throw(
				'[Redis] REDIS_TLS is enabled but REDIS_URL is not set — a rediss:// URL is required.'
			)
		})

		it('throws when REDIS_URL is not a parsable URL', () => {
			// Dropped colon, a real typo. new URL() throw TypeError → converted to the operator-facing
			// message rather than surfacing raw.
			expect(() => resolveRedisUrl('redis//cache.internal:6379')).to.throw(
				'[Redis] REDIS_TLS is enabled but REDIS_URL is not a valid URL — a rediss:// URL is required.'
			)
		})

		it('reports a bare host:port as a wrong scheme, not as unparsable', () => {
			// new URL('cache.internal:6379') parse: 'cache.internal' is a syntactically valid scheme and
			// '6379' become the path. Value reach the scheme check, not the catch, and the message must
			// say so.
			expect(() => resolveRedisUrl('cache.internal:6379')).to.throw(
				'[Redis] REDIS_TLS is enabled but REDIS_URL uses scheme "cache.internal:" — rediss:// required.'
			)
		})

		it('throws an Error instance, so a boot crash carry a stack', () => {
			expect(() => resolveRedisUrl('redis://cache.internal:6379')).to.throw(Error)
		})
	})
})
