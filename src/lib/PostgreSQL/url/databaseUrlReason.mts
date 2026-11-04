import type { IDatabaseUrlOptions } from '@lib/PostgreSQL/url/IDatabaseUrlOptions.mjs'
import type { IDatabaseUrlReason } from '@lib/PostgreSQL/url/IDatabaseUrlReason.mjs'
import { isAbsolutePath } from '@lib/PostgreSQL/url/isAbsolutePath.mjs'
import { isValidHost } from '@lib/PostgreSQL/url/isValidHost.mjs'
import { LOOPBACK_HOSTS } from '@lib/PostgreSQL/url/LOOPBACK_HOSTS.mjs'

/** The only query parameters a URL may carry. */
const ALLOWED_QUERY: readonly string[] = ['sslmode', 'sslrootcert']

const IDENTIFIER = /^\w[\w-]*$/
const SCHEME = /^postgres(?:ql)?:\/\//

/** The host of a parsed URL without the brackets of an IPv6 literal. */
const hostOf = (url: URL): string => (url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname)

/** True when a character is whitespace, a control character or a backslash. */
function hasForbiddenChar(text: string): boolean {
	for (const char of text) {
		const code = char.charCodeAt(0)
		if (code <= 0x20 || code === 0x7f || code === 0x5c) return true
	}
	return false
}

/** The reason the text cannot be a URL at all, before it is parsed, or `undefined`. */
function syntaxReason(text: string): IDatabaseUrlReason | undefined {
	if (hasForbiddenChar(text)) return 'url_syntax'
	return SCHEME.test(text) ? undefined : 'url_scheme'
}

/** The URL, parsed with the same `URL` parser the driver uses; `undefined` when it cannot be parsed or has a fragment. */
function parseUrl(text: string): URL | undefined {
	try {
		const url = new URL(text)
		return url.hash === '' ? url : undefined
	} catch {
		return undefined
	}
}

function roleReason(url: URL, expectedRole: string): IDatabaseUrlReason | undefined {
	if (!IDENTIFIER.test(url.username)) return 'url_user'
	return url.username === expectedRole ? undefined : 'url_role'
}

function locationReason(url: URL): IDatabaseUrlReason | undefined {
	if (!isValidHost(hostOf(url))) return 'url_host'
	// An absent port reads as 0 here, which the lower bound refuses; the parser has already refused a port above 65535
	// and has written the digits without leading zeros.
	const port = Number(url.port)
	if (port < 1) return 'url_port'
	// The identifier has no `/`, so `/a/b` and a missing name both fail here.
	return IDENTIFIER.test(url.pathname.slice(1)) ? undefined : 'url_database'
}

function queryReason(url: URL): IDatabaseUrlReason | undefined {
	const seen = new Set<string>()
	for (const [key, value] of url.searchParams) {
		if (!ALLOWED_QUERY.includes(key) || seen.has(key)) return 'url_query'
		seen.add(key)
		if (key === 'sslrootcert' && !isAbsolutePath(value)) return 'url_query'
	}
	return undefined
}

/** The TLS rule: `verify-full`, or a loopback host when the caller allows plain loopback. */
function tlsReason(url: URL, allowPlainLoopback: boolean): IDatabaseUrlReason | undefined {
	if (url.searchParams.get('sslmode') === 'verify-full') return undefined
	const loopback = LOOPBACK_HOSTS.includes(hostOf(url).toLowerCase())
	return loopback && allowPlainLoopback ? undefined : 'url_tls'
}

/**
 * Checks a database URL. Answers `undefined` when it is acceptable, otherwise the first reason it is not, in this order:
 * syntax, scheme, user, role, host, port, database name, query, TLS. The reason is a closed word; it never contains a
 * part of the URL.
 *
 * A URL is accepted only when it has a user equal to `expectedRole`, a host, an explicit port and one database name, and
 * only when it asks for TLS with certificate and name verification (`sslmode=verify-full`), except for a loopback
 * host when `allowPlainLoopback` is true.
 *
 * Why the URL is read so strictly. node-postgres reads a connection string with the WHATWG `URL` parser, then copies
 * every query parameter over the parsed parts: `?host=`, `?port=`, `?user=` and `?password=` replace the host, the
 * port, the user and the password of the URL itself, `?ssl=0` and `?sslmode=` change TLS, and `?uselibpqcompat=true`
 * changes what `sslmode` means. A check that looked only at the authority would pass a URL that connects somewhere
 * else, under another login, without TLS. So the query is an allow-list (`sslmode`, `sslrootcert`, each at most once),
 * the user and the database name are plain identifiers (no percent-escape whose decoding two parsers could disagree
 * about), and this function uses the same `URL` parser as the driver.
 */
export function databaseUrlReason(text: string, options: IDatabaseUrlOptions): IDatabaseUrlReason | undefined {
	const early = syntaxReason(text)
	if (early !== undefined) return early
	const url = parseUrl(text)
	if (url === undefined) return 'url_syntax'
	return (
		roleReason(url, options.expectedRole) ??
		locationReason(url) ??
		queryReason(url) ??
		tlsReason(url, options.allowPlainLoopback)
	)
}
