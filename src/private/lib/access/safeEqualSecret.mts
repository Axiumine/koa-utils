import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * SHA-256 of the string's UTF-16 code units. `utf16le` rather than the default `utf8` on purpose: UTF-8
 * replaces every lone surrogate with U+FFFD, so two different strings could share a digest and compare
 * equal. UTF-16 keeps each code unit, which makes digest equality exactly the same relation as `===`.
 */
const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf16le').digest()

/**
 * Constant-time equality of two secret strings (a mail hash, a reset hash).
 *
 * `===` returns at the first differing character, so response time leaks how long a guessed prefix is
 * correct. Here both sides are hashed to 32 bytes first, which makes the compared buffers equal in length
 * whatever the inputs are (`timingSafeEqual` throws on unequal lengths and a length check would leak the
 * secret's length), and then `timingSafeEqual` compares the digests.
 *
 * Fails closed: anything that is not a string on either side (an unset stored hash, a field read off a
 * lean document) is `false`, including `undefined` against `undefined`. For two strings the result is
 * exactly `a === b`.
 */
export const safeEqualSecret = (a: unknown, b: unknown): boolean => {
	if (typeof a !== 'string' || typeof b !== 'string') {
		return false
	}
	return timingSafeEqual(digest(a), digest(b))
}
