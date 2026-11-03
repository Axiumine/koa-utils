/**
 * Escape a value for HTML text content and for a quoted attribute value (`"` or `'`).
 *
 * The one place the mail templates escape: `&` goes first so the entities added after it are not escaped
 * again. Non-ASCII characters pass through untouched, since the mail is sent as UTF-8. A number is accepted
 * because callers interpolate ids that may arrive as one, and anything else is stringified the way the old
 * string concatenation did.
 */
export function escapeHtml(value: string | number): string {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')
}
