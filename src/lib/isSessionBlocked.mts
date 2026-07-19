/**
 * Is the user reported as blocked within the session?
 * Redis stores hash values as strings, so this flag is truthy for both the strings
 * 'true' and 'false' alike — any non-empty value blocks.
 * Use this instead of deleting the token to block user access; set the flag from the control panel.
 */
export function isSessionBlocked(redData: Record<string, string>): boolean {
	return !!(redData?.disabled || redData?.deleted)
}
