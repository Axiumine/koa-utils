import { DbConnectError } from '@lib/PostgreSQL/error/DbConnectError.mjs'

/** The only query parameters a pool URL may carry. */
const ALLOWED_QUERY: readonly string[] = ['sslmode', 'sslrootcert']

function assertPoolUrl(parsed: URL): void {
	if ((parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') || parsed.hostname === '' || parsed.hash !== '') {
		throw new DbConnectError('URL_INVALID')
	}
	const seen = new Set<string>()
	for (const key of parsed.searchParams.keys()) {
		if (!ALLOWED_QUERY.includes(key) || seen.has(key)) throw new DbConnectError('URL_INVALID')
		seen.add(key)
	}
}

/**
 * Checks the URL and answers the strings that must never be written out: the URL and its password, raw and
 * percent-decoded, longest first. The order needs no sort: the URL holds the password, and decoding never makes a
 * password longer. The query may hold `sslmode` and `sslrootcert` and nothing else, because node-postgres
 * lets a parameter of the URL replace a setting of the pool (`application_name`, `host`, `user`). A URL that fails is
 * refused with a `DbConnectError` that holds no part of it.
 */
export function poolUrlSecrets(url: string): string[] {
	let parsed: URL
	try {
		parsed = new URL(url)
	} catch {
		throw new DbConnectError('URL_INVALID')
	}
	assertPoolUrl(parsed)
	const secrets = new Set<string>([url, parsed.password])
	try {
		secrets.add(decodeURIComponent(parsed.password))
	} catch {
		// A password that is not valid percent-encoding is still in the set in its raw form.
	}
	// nosemgrep: ajinabraham.njsscan.crypto.timing_attack_node.node_timing_attack -- drops empty strings; no secret is compared with another value
	return [...secrets].filter((secret) => secret !== '')
}
