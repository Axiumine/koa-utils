/**
 * Tests for private/lib/verifyIntrospectionCode.mts
 *
 * Chain: verifyIntrospectionCode(headerValue) → reads process.env.INTROSPECTION_CODE →
 *        fails closed when unset/empty → constant-time byte compare via timingSafeEqual
 *
 * The regression under test: the call sites used to compare against
 * `${process.env.INTROSPECTION_CODE}`, which coerces an unset variable to the string
 * 'undefined'. A client sending `x-introspectioncode: undefined` matched it with no secret.
 */
import { verifyIntrospectionCode } from '@private/lib/verifyIntrospectionCode.mjs'
import { expect } from 'chai'

import { restoreIntrospectionCode, saveIntrospectionCode } from '../../helpers/introspectionCode.mjs'

// ---------------------------------------------------------------------------

describe('verifyIntrospectionCode', () => {
	let savedCode: string | undefined

	beforeEach(() => {
		savedCode = saveIntrospectionCode()
	})

	afterEach(() => {
		restoreIntrospectionCode(savedCode)
	})

	it('returns false for the literal string "undefined" when INTROSPECTION_CODE is unset', () => {
		delete process.env.INTROSPECTION_CODE

		expect(verifyIntrospectionCode('undefined')).to.equal(false)
	})

	it('returns false for any header value when INTROSPECTION_CODE is unset', () => {
		delete process.env.INTROSPECTION_CODE

		expect(verifyIntrospectionCode('anything')).to.equal(false)
		expect(verifyIntrospectionCode('')).to.equal(false)
		expect(verifyIntrospectionCode(undefined)).to.equal(false)
	})

	it('returns false when INTROSPECTION_CODE is set to an empty string', () => {
		process.env.INTROSPECTION_CODE = ''

		expect(verifyIntrospectionCode('')).to.equal(false)
		expect(verifyIntrospectionCode('anything')).to.equal(false)
	})

	it('returns false when the header is absent but INTROSPECTION_CODE is set', () => {
		process.env.INTROSPECTION_CODE = 'secret'

		expect(verifyIntrospectionCode(undefined)).to.equal(false)
	})

	it('returns false when the header length differs from the code', () => {
		process.env.INTROSPECTION_CODE = 'secret'

		expect(verifyIntrospectionCode('short')).to.equal(false)
		expect(verifyIntrospectionCode('secretsecret')).to.equal(false)
	})

	it('returns false for a same-length header with different content', () => {
		process.env.INTROSPECTION_CODE = 'secret'

		expect(verifyIntrospectionCode('xecret')).to.equal(false)
	})

	it('returns false without throwing when a multi-byte header matches the code in characters', () => {
		// 'é' is one character but two UTF-8 bytes: comparing character length instead of byte
		// length would hand timingSafeEqual two unequal buffers and raise a RangeError, turning
		// the guard into a crash an unauthenticated caller could trigger at will.
		process.env.INTROSPECTION_CODE = 'secret'

		expect(() => verifyIntrospectionCode('sécret')).to.not.throw()
		expect(verifyIntrospectionCode('sécret')).to.equal(false)
	})

	it('returns true when the header matches INTROSPECTION_CODE exactly', () => {
		process.env.INTROSPECTION_CODE = 'secret'

		expect(verifyIntrospectionCode('secret')).to.equal(true)
	})
})
