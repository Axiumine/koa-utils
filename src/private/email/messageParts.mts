import { StringLib } from '@lib/StringLib.mjs'

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
 * Confirmation or reset link: `<base><path>/<encodeURI(email)>/<hash>`. A trailing slash on `linkBase` and a
 * missing leading slash on `linkPath` are normalised away.
 */
export function confirmationLink(linkBase: string, linkPath: string, emailTo: string, hash: string): string {
	const base = stripTrailingSlashes(linkBase)
	const path = `/${linkPath.replace(/^\/+/, '')}`
	return `${base}${path}/${encodeURI(emailTo)}/${hash}`
}
