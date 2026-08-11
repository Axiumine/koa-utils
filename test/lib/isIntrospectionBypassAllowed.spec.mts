/**
 * Tests for lib/isIntrospectionBypassAllowed.mts
 *
 * Chain: isIntrospectionBypassAllowed() → read process.env.NODE_ENV → allowlist
 * 'development' / 'test' → true, everything else → false.
 *
 * The predicate is an allowlist and these specs exist to keep it one. The tempting rewrite,
 * `process.env.NODE_ENV !== 'production'`, passes any suite that only checks 'development' and
 * 'production'; it differs from the allowlist exactly on the unrecognised values, and every one of
 * those is a realistic misconfiguration that would open an authentication bypass in production. The
 * unset / '' / 'Production' / 'prod' / 'staging' cases below are what reject that rewrite, so they
 * are the point of this file rather than padding.
 *
 * Asserts pin exact `false`, never falsiness: a mutant returning a truthy non-boolean still pass a
 * truthiness assert.
 */
import { isIntrospectionBypassAllowed } from '@lib/isIntrospectionBypassAllowed.mjs'
import { expect } from 'chai'

import { restoreNodeEnv, saveNodeEnv } from '../helpers/nodeEnv.mjs'

// ---------------------------------------------------------------------------

describe('isIntrospectionBypassAllowed', () => {
	let savedEnv: string | undefined

	beforeEach(() => {
		savedEnv = saveNodeEnv()
	})

	afterEach(() => {
		restoreNodeEnv(savedEnv)
	})

	it('returns true under NODE_ENV=development', () => {
		process.env.NODE_ENV = 'development'

		expect(isIntrospectionBypassAllowed()).to.equal(true)
	})

	it('returns true under NODE_ENV=test', () => {
		process.env.NODE_ENV = 'test'

		expect(isIntrospectionBypassAllowed()).to.equal(true)
	})

	it('returns false under NODE_ENV=production', () => {
		process.env.NODE_ENV = 'production'

		expect(isIntrospectionBypassAllowed()).to.equal(false)
	})

	it('returns false when NODE_ENV is unset', () => {
		// Ordinary failure of a container runtime — no NODE_ENV in env. Denylist form
		// (`!== 'production'`) return true here → bypass live in prod.
		delete process.env.NODE_ENV

		expect(isIntrospectionBypassAllowed()).to.equal(false)
	})

	it('returns false when NODE_ENV is an empty string', () => {
		process.env.NODE_ENV = ''

		expect(isIntrospectionBypassAllowed()).to.equal(false)
	})

	it('returns false for NODE_ENV values that only look like production', () => {
		// Deploy-script typos + house conventions. Denylist form accept all 3.
		for (const value of ['Production', 'PRODUCTION', 'prod']) {
			process.env.NODE_ENV = value

			expect(isIntrospectionBypassAllowed(), value).to.equal(false)
		}
	})

	it('returns false under NODE_ENV=staging', () => {
		// Real env, not on allowlist → refuse. Deliberate: staging carry real data.
		process.env.NODE_ENV = 'staging'

		expect(isIntrospectionBypassAllowed()).to.equal(false)
	})

	it('returns false for case variants of the allowed values', () => {
		// Compare exact, no case fold.
		for (const value of ['Development', 'TEST', 'Test']) {
			process.env.NODE_ENV = value

			expect(isIntrospectionBypassAllowed(), value).to.equal(false)
		}
	})
})
