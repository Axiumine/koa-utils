import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

import { isIntrospectionBypassAllowed } from '@lib/isIntrospectionBypassAllowed.mjs'

/**
 * Constant-time check of the `x-introspectioncode` header against INTROSPECTION_CODE.
 *
 * Environment-gated first: unless `isIntrospectionBypassAllowed()` says this process runs under
 * `NODE_ENV` `'development'` or `'test'`, this returns `false` before INTROSPECTION_CODE is read
 * at all. A correctly configured secret plus a correct header still fails in production. That
 * gate is an allowlist on purpose — see `isIntrospectionBypassAllowed` for why the negated
 * `NODE_ENV !== 'production'` form is unsafe and must not be substituted here.
 *
 * The gate lives in this function rather than in the three middlewares that call it, so a direct
 * caller of the primitive cannot reach an ungated comparison.
 *
 * Fails closed on the secret too: an unset or empty INTROSPECTION_CODE never matches, whatever the
 * caller sends. The call sites previously compared against `${process.env.INTROSPECTION_CODE}`,
 * which coerces an unset variable to the literal string 'undefined' — a client sending that exact
 * header value satisfied the check with no secret at all.
 */
export const verifyIntrospectionCode = (headerValue: string | undefined): boolean => {
	if (!isIntrospectionBypassAllowed()) {
		return false
	}
	const code = process.env.INTROSPECTION_CODE
	if (typeof code !== 'string' || code.length === 0) {
		return false
	}
	if (typeof headerValue !== 'string') {
		return false
	}
	// byte length, not character length: timingSafeEqual throws on unequal-length buffers, and a
	// multi-byte header value can match code.length while encoding to a different number of bytes
	const headerBuffer = Buffer.from(headerValue)
	const codeBuffer = Buffer.from(code)
	if (headerBuffer.length !== codeBuffer.length) {
		return false
	}
	return timingSafeEqual(headerBuffer, codeBuffer)
}
