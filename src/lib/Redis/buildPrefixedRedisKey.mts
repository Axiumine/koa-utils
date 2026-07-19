/**
 * Builds a Redis session key by adding its namespace prefix ('access:' or 'refresh:') — unless the
 * token already carries it, in which case it is returned unchanged.
 * ctx.state.user.refreshToken/accessToken arrive already prefixed from this package's own
 * authenticatedLogoutHandler / authenticatedAuthorizationHandler, but a consumer wiring
 * ctx.state.user by hand may pass a bare uuid: accept both shapes so the caller never builds
 * 'refresh:refresh:<uuid>' and deletes a key that was never written.
 */
export function buildPrefixedRedisKey(prefix: 'access:' | 'refresh:', token: string): string {
	return token.startsWith(prefix) ? token : `${prefix}${token}`
}
