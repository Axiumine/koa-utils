import { StringLib } from '@lib/StringLib.mjs'
import { throwInternalError } from '@throw/throwInternalError.mjs'

import { escapeHtml } from './escapeHtml.mjs'

const strings = new StringLib()

/** Greeting suffix: a leading space plus the name, or nothing when there is no name. */
export function fixName(name: string): string {
	return name !== '' ? ` ${name}` : ''
}

/**
 * Anchor for the HTML part. The URL goes into a single-quoted `href` and the text into element content, so both
 * pass through {@link escapeHtml}; the plain-text part keeps the unescaped URL.
 */
export function htmlLink(link: string, linkText: string = ''): string {
	return strings.makeLink(escapeHtml(link), escapeHtml(linkText))
}

/** Drop every trailing `/`. A loop on `endsWith` instead of `/\/+$/`, which backtracks quadratically on long runs. */
function stripTrailingSlashes(value: string): string {
	let end = value.length
	while (value.endsWith('/', end)) end -= 1
	return value.slice(0, end)
}

/**
 * Control characters, whitespace and backslash. The URL parser drops or rewrites them (it strips leading and
 * trailing control characters and spaces, removes tab and newline anywhere, turns `\` into `/`), so a string
 * that holds one parses as something other than what is written. The base is emitted as written, so it must be
 * a string the parser reads as it stands.
 */
const NOT_PARSED_AS_WRITTEN = /[\p{Cc}\s\\]/u

/**
 * Judge a link base on the parsed URL, never on its prefix: `JaVaScRiPt:`, ` javascript:` and `java\tscript:`
 * all parse to the `javascript:` scheme, `//evil.example` has no scheme and does not parse at all, and
 * `https://good@evil` is an `https:` URL whose host is `evil`. Only an absolute `http:` or `https:` URL passes,
 * and one with no user name and no password, since a base never needs them and `user@host` is how a link is
 * made to read as a host it does not go to.
 */
function isHttpLinkBase(value: string): boolean {
	if (NOT_PARSED_AS_WRITTEN.test(value)) return false
	const url = URL.parse(value)
	return url !== null && (url.protocol === 'http:' || url.protocol === 'https:') && url.username === '' && url.password === ''
}

/**
 * The scheme + host every link in a mail is built on, checked before it is placed in a link or an `href`.
 * Returns `linkBase` exactly as given when it is an absolute `http:` / `https:` URL; otherwise throws
 * `throwInternalError()` (500 `Internal Server Error`, `Error reported to Dev Team.`), as `wrongHashMessage`
 * does: a base that is not one is a configuration or caller mistake, never something the recipient can fix,
 * and the mail is not sent. Escaping alone does not cover this: a `javascript:` base survives `escapeHtml`
 * and becomes a link target.
 */
export function httpLinkBase(linkBase: string): string {
	if (!isHttpLinkBase(linkBase)) throwInternalError()
	return linkBase
}

/**
 * Confirmation or reset link: `<base><path>/<encodeURI(email)>/<hash>`. A trailing slash on `linkBase` and a
 * missing leading slash on `linkPath` are normalised away. `linkBase` goes through {@link httpLinkBase} first.
 */
export function confirmationLink(linkBase: string, linkPath: string, emailTo: string, hash: string): string {
	const base = stripTrailingSlashes(httpLinkBase(linkBase))
	const path = `/${linkPath.replace(/^\/+/, '')}`
	return `${base}${path}/${encodeURI(emailTo)}/${hash}`
}
