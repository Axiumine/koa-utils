/**
 * Tests for private/lib/verifyIntrospectionCode.mts
 *
 * Chain: verifyIntrospectionCode(headerValue) → isIntrospectionBypassAllowed() env gate →
 * read process.env.INTROSPECTION_CODE → fail closed when unset/empty → compare via
 * safeEqualSecret (sha256 both sides + timingSafeEqual, no length early return)
 *
 * Compare swap pinned by forced-verdict specs at the bottom. Behavioural specs keep same verdict as
 * old `===` / length-guard impl for every input: swap = timing only, no observable change.
 *
 * Two regressions pinned here.
 *
 * First: call sites compared against `${process.env.INTROSPECTION_CODE}`, which coerce an unset var
 * to string 'undefined'. A client sending `x-introspectioncode: undefined` matched it with no
 * secret.
 *
 * Second: the header bypassed authentication under every NODE_ENV, production included. Two
 * separate properties fall out of that, and they need separate specs. Dominance — a correctly
 * configured secret and a correct header must still fail outside 'development' / 'test' — is
 * pinned by the 'production' / unset / near-miss cases. Statement order — the gate runs before
 * INTROSPECTION_CODE is read at all — is invisible to a return value, so it gets its own spec at
 * the bottom of the file that records env reads through a Proxy.
 */
import { verifyIntrospectionCode } from '@private/lib/verifyIntrospectionCode.mjs'
import { expect } from 'chai'

import { restoreIntrospectionCode, saveIntrospectionCode } from '../../helpers/introspectionCode.mjs'
import { restoreNodeEnv, saveNodeEnv } from '../../helpers/nodeEnv.mjs'
import { expectOneDigestCompare, releaseTimingSafeEqual, stubTimingSafeEqual } from '../../helpers/timingSafeEqualProbe.mjs'

// ---------------------------------------------------------------------------

describe('verifyIntrospectionCode', () => {
	let savedCode: string | undefined
	let savedEnv: string | undefined

	beforeEach(() => {
		savedCode = saveIntrospectionCode()
		savedEnv = saveNodeEnv()
		// Mocha set no NODE_ENV → gate refuse everything. Specs below exercise the secret compare,
		// so they need an allowed env; the gate itself get its own cases at the bottom.
		process.env['NODE_ENV'] = 'test'
	})

	afterEach(() => {
		releaseTimingSafeEqual()
		restoreIntrospectionCode(savedCode)
		restoreNodeEnv(savedEnv)
	})

	it('returns false for the literal string "undefined" when INTROSPECTION_CODE is unset', () => {
		delete process.env['INTROSPECTION_CODE']

		expect(verifyIntrospectionCode('undefined')).to.equal(false)
	})

	it('returns false for any header value when INTROSPECTION_CODE is unset', () => {
		delete process.env['INTROSPECTION_CODE']

		expect(verifyIntrospectionCode('anything')).to.equal(false)
		expect(verifyIntrospectionCode('')).to.equal(false)
		expect(verifyIntrospectionCode(undefined)).to.equal(false)
	})

	it('returns false when INTROSPECTION_CODE is set to an empty string', () => {
		process.env['INTROSPECTION_CODE'] = ''

		expect(verifyIntrospectionCode('')).to.equal(false)
		expect(verifyIntrospectionCode('anything')).to.equal(false)
	})

	it('returns false when the header is absent but INTROSPECTION_CODE is set', () => {
		process.env['INTROSPECTION_CODE'] = 'secret'

		expect(verifyIntrospectionCode(undefined)).to.equal(false)
	})

	it('returns false when the header length differs from the code', () => {
		process.env['INTROSPECTION_CODE'] = 'secret'

		expect(verifyIntrospectionCode('short')).to.equal(false)
		expect(verifyIntrospectionCode('secretsecret')).to.equal(false)
	})

	it('returns false for a same-length header with different content', () => {
		process.env['INTROSPECTION_CODE'] = 'secret'

		expect(verifyIntrospectionCode('xecret')).to.equal(false)
	})

	it('returns false without throwing when a multi-byte header matches the code in characters', () => {
		// 'é' = 1 char, 2 UTF-8 bytes: raw-buffer timingSafeEqual on unequal lengths → RangeError →
		// the guard become a crash any unauthenticated caller trigger at will. Digest compare = always 32 bytes.
		process.env['INTROSPECTION_CODE'] = 'secret'

		expect(() => verifyIntrospectionCode('sécret')).to.not.throw()
		expect(verifyIntrospectionCode('sécret')).to.equal(false)
	})

	it('returns true when the header matches INTROSPECTION_CODE exactly', () => {
		process.env['INTROSPECTION_CODE'] = 'secret'

		expect(verifyIntrospectionCode('secret')).to.equal(true)
	})

	it('returns false for a non-string header value without throwing', () => {
		// header typed string | undefined; Node can still hand an array for a repeated header.
		process.env['INTROSPECTION_CODE'] = 'secret'

		expect(() => verifyIntrospectionCode(['secret'] as never)).to.not.throw()
		expect(verifyIntrospectionCode(['secret'] as never)).to.equal(false)
		expect(verifyIntrospectionCode(null as never)).to.equal(false)
	})

	it('returns true when the header matches under NODE_ENV=development', () => {
		process.env['NODE_ENV'] = 'development'
		process.env['INTROSPECTION_CODE'] = 'secret'

		expect(verifyIntrospectionCode('secret')).to.equal(true)
	})

	it('returns false under NODE_ENV=production even with a correct code and a correct header', () => {
		// Dominance assert. Secret set, header match it exactly → only the env gate can return
		// false here. Pin the outcome, not the statement order; order get its own spec below.
		process.env['NODE_ENV'] = 'production'
		process.env['INTROSPECTION_CODE'] = 'secret'

		expect(verifyIntrospectionCode('secret')).to.equal(false)
	})

	it('returns false when NODE_ENV is unset even with a correct code and a correct header', () => {
		delete process.env['NODE_ENV']
		process.env['INTROSPECTION_CODE'] = 'secret'

		expect(verifyIntrospectionCode('secret')).to.equal(false)
	})

	it('returns false for near-miss NODE_ENV values even with a correct code and a correct header', () => {
		// Denylist form (`!== 'production'`) honour the header for every one of these.
		process.env['INTROSPECTION_CODE'] = 'secret'

		for (const value of ['Production', 'prod', 'staging', '']) {
			process.env['NODE_ENV'] = value

			expect(verifyIntrospectionCode('secret'), value).to.equal(false)
		}
	})

	it('never reads INTROSPECTION_CODE when the env gate refuses', () => {
		// Statement-order assert, and the only spec here with teeth on it.
		//
		// Every other spec in this file pin a return value, and a return value cannot tell "gate is
		// the first statement" apart from "gate is the last statement before the success return":
		// both answer false for every input combination reachable from the outside. Move the gate
		// down past the INTROSPECTION_CODE read and the whole rest of the file stay green.
		//
		// So observe the read itself. `Object.defineProperty(process.env, k, { get })` throw —
		// "'process.env' does not accept an accessor(getter/setter) descriptor" — but swapping the
		// whole `process.env` slot for a recording Proxy work, and reads/writes pass through.
		process.env['NODE_ENV'] = 'production'
		process.env['INTROSPECTION_CODE'] = 'secret'

		const realEnv = process.env
		const readKeys: string[] = []
		const recordingEnv = new Proxy(realEnv, {
			get(target, prop) {
				if (typeof prop === 'string') {
					readKeys.push(prop)
				}

				return target[prop as string]
			}
		})

		// Restore in `finally`: leave the Proxy installed on a failed assert → every later spec
		// file in the mocha run keep recording into a dead array.
		Object.defineProperty(process, 'env', { configurable: true, writable: true, value: recordingEnv })
		try {
			expect(verifyIntrospectionCode('secret')).to.equal(false)
		} finally {
			Object.defineProperty(process, 'env', { configurable: true, writable: true, value: realEnv })
		}

		expect(readKeys).to.include('NODE_ENV')
		expect(readKeys).to.not.include('INTROSPECTION_CODE')
	})

	// Revert of the compare to `===`, or back to a byte-length early return, keep every spec above green:
	// same verdict per input. Forced verdict split them → compare MUST reach safeEqualSecret →
	// timingSafeEqual, whatever the header length. Early return on length = length oracle on INTROSPECTION_CODE.
	it('constant-time compare: forced "equal" verdict accepts a wrong header, via 2 digests', () => {
		process.env['INTROSPECTION_CODE'] = 'secret'
		const probe = stubTimingSafeEqual(true)

		expect(verifyIntrospectionCode('wrong!')).to.equal(true)
		expectOneDigestCompare(probe)
	})

	it('constant-time compare: forced "equal" verdict is reached for shorter, longer and multi-byte headers', () => {
		// Length early return never reach timingSafeEqual → stub never called → verdict stay false.
		process.env['INTROSPECTION_CODE'] = 'secret'

		for (const header of ['short', 'secretsecret', 'sécret', 'x']) {
			const probe = stubTimingSafeEqual(true)

			expect(verifyIntrospectionCode(header), header).to.equal(true)
			expectOneDigestCompare(probe)
			releaseTimingSafeEqual()
		}
	})

	it('constant-time compare: forced "different" verdict rejects an identical header', () => {
		process.env['INTROSPECTION_CODE'] = 'secret'
		const probe = stubTimingSafeEqual(false)

		expect(verifyIntrospectionCode('secret')).to.equal(false)
		expectOneDigestCompare(probe)
	})

	it('never reaches the compare when the secret is unset or empty, even with a forced "equal" verdict', () => {
		// safeEqualSecret('', '') is true → only the explicit empty-secret guard keep this false.
		const probe = stubTimingSafeEqual(true)

		delete process.env['INTROSPECTION_CODE']
		expect(verifyIntrospectionCode('')).to.equal(false)
		expect(verifyIntrospectionCode('undefined')).to.equal(false)

		process.env['INTROSPECTION_CODE'] = ''
		expect(verifyIntrospectionCode('')).to.equal(false)
		expect(verifyIntrospectionCode('anything')).to.equal(false)

		expect(probe.called).to.equal(false)
	})

	it('never reaches the compare for an absent or non-string header, even with a forced "equal" verdict', () => {
		process.env['INTROSPECTION_CODE'] = 'secret'
		const probe = stubTimingSafeEqual(true)

		expect(verifyIntrospectionCode(undefined)).to.equal(false)
		expect(verifyIntrospectionCode(['secret'] as never)).to.equal(false)

		expect(probe.called).to.equal(false)
	})

	it('never reaches the compare when the env gate refuses, even with a forced "equal" verdict', () => {
		process.env['NODE_ENV'] = 'production'
		process.env['INTROSPECTION_CODE'] = 'secret'
		const probe = stubTimingSafeEqual(true)

		expect(verifyIntrospectionCode('secret')).to.equal(false)
		expect(probe.called).to.equal(false)
	})
})
