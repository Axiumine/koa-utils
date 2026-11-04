import { isIP } from 'node:net'

// eslint-disable-next-line security/detect-unsafe-regex -- nested quantifier is the bounded {0,61} inside an optional group, no backtracking blow-up
const DNS_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/
/** The last label is all digits: `127.1`, `999.1.1.1`, `8080`. */
const NUMERIC_TAIL = /(?:^|\.)\d+$/

/**
 * True for a host name, an IPv4 address or an IPv6 address. A scheme, a port, a path, a user, a bracket, a zone id, an
 * underscore and a trailing dot are all refused. A name whose last label is all digits is refused too: it is how
 * `127.1` and `999.1.1.1` look, and a resolver may read them as addresses.
 */
export function isValidHost(text: string): boolean {
	if (text.length > 253) return false
	if (isIP(text) !== 0) return !text.includes('%')
	if (!text.split('.').every((label) => DNS_LABEL.test(label))) return false
	return !NUMERIC_TAIL.test(text)
}
