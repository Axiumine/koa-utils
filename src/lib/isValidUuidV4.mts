const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Is this a syntactically valid v4 UUID — the shape generateAccessToken/generateRefreshToken
 * (src/lib/tokens.mts) always produce?
 * Used at the trust boundary to reject a client-supplied token suffix before it is used to build
 * a Redis key: checking the 'access:' prefix alone still leaves the rest of the key client-controlled.
 */
export function isValidUuidV4(value: string): boolean {
	return UUID_V4_RE.test(value)
}
