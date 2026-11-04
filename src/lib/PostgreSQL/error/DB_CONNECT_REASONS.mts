/**
 * The closed reasons of a connection that the pool refuses (see {@link DbConnectError}):
 *
 * - `URL_INVALID`: the connection string is not a `postgres://` or `postgresql://` URL the pool accepts.
 * - `CONNECT_TIMEOUT`: the connection, the login and the session check did not finish in `connectTimeoutMs`.
 * - `CONNECT_FAILED`: the driver or the server refused (refused connection, name not found, login refused, server
 *   shutting down). `code` carries the short driver or SQLSTATE code when there is one.
 * - `TIMEZONE_NOT_UTC`: the session time zone is not `UTC`; the role-level `timezone` setting is missing or was
 *   overridden.
 */
export const DB_CONNECT_REASONS = ['URL_INVALID', 'CONNECT_TIMEOUT', 'CONNECT_FAILED', 'TIMEZONE_NOT_UTC'] as const
