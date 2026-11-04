/**
 * The closed words {@link databaseUrlReason} answers with; none contains a part of the URL:
 *
 * - `url_syntax`: whitespace, a control character or a backslash; not parseable; a fragment.
 * - `url_scheme`: not `postgres://` or `postgresql://`.
 * - `url_user`: no user, or a user that is not a plain identifier.
 * - `url_role`: the user is not the expected role.
 * - `url_host`: not a host name or an IP address.
 * - `url_port`: no explicit port, or a port outside 1 to 65535.
 * - `url_database`: no database name, or one that is not a plain identifier.
 * - `url_query`: a query parameter other than `sslmode` and an absolute `sslrootcert`, or one given twice.
 * - `url_tls`: no `sslmode=verify-full`, and not a loopback host the caller exempted.
 */
export type IDatabaseUrlReason =
	'url_syntax' | 'url_scheme' | 'url_user' | 'url_role' | 'url_host' | 'url_port' | 'url_database' | 'url_query' | 'url_tls'
