import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

/**
 * Constant-time check of the `x-introspectioncode` header against INTROSPECTION_CODE.
 *
 * Fails closed: an unset or empty INTROSPECTION_CODE never matches, whatever the caller sends.
 * The call sites previously compared against `${process.env.INTROSPECTION_CODE}`, which coerces
 * an unset variable to the literal string 'undefined' — a client sending that exact header value
 * satisfied the check with no secret at all.
 */
export const verifyIntrospectionCode = (headerValue: string | undefined): boolean => {
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
