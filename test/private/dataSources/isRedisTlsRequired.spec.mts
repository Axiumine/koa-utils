/**
 * Tests for private/dataSources/isRedisTlsRequired.mts
 *
 * Chain: isRedisTlsRequired() → read process.env.REDIS_TLS → exact match on string 'true' → true,
 * everything else → false.
 *
 * Predicate is exact-match, specs exist to keep it one. Two rewrites pass a suite checking only
 * 'true' + 'false', and both are wrong. `Boolean(process.env.REDIS_TLS)` read literal string
 * 'false' as true → TLS forced on an operator who explicitly turned it off. `!== 'false'` read
 * unset var as true → TLS forced on every deployment predating the flag. Unset / '' / 'false' /
 * '1' / 'TRUE' cases below reject both, so they are point of this file, not padding.
 *
 * Asserts pin exact `false` / `true`, never falsiness: mutant returning truthy non-boolean still
 * pass truthiness assert.
 */
import { isRedisTlsRequired } from '@private/dataSources/isRedisTlsRequired.mjs'
import { expect } from 'chai'

import { restoreRedisTls, saveRedisTls } from '../../helpers/redisTls.mjs'

// ---------------------------------------------------------------------------

describe('isRedisTlsRequired', () => {
	let savedTls: string | undefined

	beforeEach(() => {
		savedTls = saveRedisTls()
	})

	afterEach(() => {
		restoreRedisTls(savedTls)
	})

	it('returns true when REDIS_TLS is exactly "true"', () => {
		process.env.REDIS_TLS = 'true'

		expect(isRedisTlsRequired()).to.equal(true)
	})

	it('returns false when REDIS_TLS is unset', () => {
		// Every deployment predating flag. `!== 'false'` form return true here → scheme flip nobody
		// asked for.
		delete process.env.REDIS_TLS

		expect(isRedisTlsRequired()).to.equal(false)
	})

	it('returns false when REDIS_TLS is an empty string', () => {
		process.env.REDIS_TLS = ''

		expect(isRedisTlsRequired()).to.equal(false)
	})

	it('returns false when REDIS_TLS is "false"', () => {
		// `Boolean()` form return true here — non-empty string. Explicit opt-out must stay opt-out.
		process.env.REDIS_TLS = 'false'

		expect(isRedisTlsRequired()).to.equal(false)
	})

	it('returns false for truthy-looking values that are not "true"', () => {
		// Doc name 1 spelling. Anything else = plaintext, documented trade-off of exact match.
		for (const value of ['1', 'yes', 'on', 'enabled']) {
			process.env.REDIS_TLS = value

			expect(isRedisTlsRequired(), value).to.equal(false)
		}
	})

	it('returns false for case variants of "true"', () => {
		// Compare exact, no case fold.
		for (const value of ['TRUE', 'True', 'tRue']) {
			process.env.REDIS_TLS = value

			expect(isRedisTlsRequired(), value).to.equal(false)
		}
	})

	it('reads REDIS_TLS at call time, not at module load', () => {
		// Callers run at module load of dataSources/Redis.mts. Module-level const would freeze first
		// import under ESM cache → every later read stale.
		process.env.REDIS_TLS = 'true'
		expect(isRedisTlsRequired()).to.equal(true)

		process.env.REDIS_TLS = 'false'
		expect(isRedisTlsRequired()).to.equal(false)
	})
})
