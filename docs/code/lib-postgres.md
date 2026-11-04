# Lib — PostgreSQL Kit

A kit of small, driver-agnostic building blocks for services that talk to PostgreSQL through [node-postgres](https://node-postgres.com) (`pg`): a pool factory that checks the session before it hands a connection out, string parsers for the date and integer types that would otherwise become a JavaScript `Date` or lose digits, closed-reason errors that never carry a password or a row, and a strict check for a database URL. It is separate from `dataSources/PostgreSQL` (the environment-driven singletons, see [data-sources.md](./data-sources.md)) and from `lib/PostgreSQL/IPostgresError` and `makePostgreSqlLogError` (documented in [lib-datasource-errors.md](./lib-datasource-errors.md)): nothing in this kit reads an environment variable or opens a connection on import.

This page covers the first part of the kit: the leaf pieces. Later parts are added beside it under the same folder.

## Principles

- **The driver is a parameter.** No file in the kit imports `pg`, and no `.d.mts` names it. `createPool` takes the module you imported (`import pg from 'pg'`) as `driver` and uses three members of it through structural types (`IDbDriver`). Importing any subpath of the kit therefore loads no peer dependency and needs none installed, `pg` included.
- **Structural seams.** A logger is any object with `warn` and `error` (`IPoolLogger`). A counter is any function of the counter name (`IDbCounter`). Nothing is a class you must extend.
- **Closed reasons, fixed messages.** Every error and every check answers with a word from a closed list. A message is built from the reason and the name of a type, never from a stored value, a URL or the text of the driver, so a password or a row cannot reach a log line through them. No error here has a `cause`.
- **One export per file.** Each value has its own subpath, and its types live in `I*` files. There is no barrel.

## Layout and names

All subpaths are `@axiumine/koa-utils/lib/PostgreSQL/<folder>/<File>`. The file name is the export name; a type file starts with `I`.

| Folder | Holds |
|---|---|
| `error/` | `DbParseError`, `DbConnectError`, their reason lists and types, the SQLSTATE readers (`sqlstateOf`, `sqlstateField`, `constraintNameOf`, `errorNameOf`) |
| `parse/` | the string parsers, `arrayOf`, and the type registry (`TYPE_PARSERS`, `createTypeRegistry`) |
| `pool/` | `createPool`, its options and constants |
| `counter/` | `IDbCounter`, the counter callback type |
| `url/` | `databaseUrlReason` and the host and path checks it uses |

Types are named `I<Name>`. When you move code that used the unprefixed names of a private copy, the mapping is:

| Unprefixed name | Name here |
|---|---|
| `DbDriver` | `IDbDriver` |
| `PoolEvents` | `IPoolEvents` |
| `CreatePoolOptions` | `ICreatePoolOptions` |
| `StringParser`, `ArrayParser` | `IStringParser`, `IArrayParser` |
| `DriverTypes` | `IDriverTypes` |
| `TypeParserEntry` | `ITypeParserEntry` |
| `DbParseReason`, `DbConnectReason` | `IDbParseReason`, `IDbConnectReason` |
| `DatabaseUrlContext`, `DatabaseUrlReason` | `IDatabaseUrlOptions`, `IDatabaseUrlReason` |

The module `src/lib/PostgreSQL` also holds three older files (`IPostgresError`, `IPostgresErrorCodes`, `makePostgreSqlLogError`). They are unrelated to the kit and unchanged. `makePostgreSqlLogError` logs the `detail` of an error; the kit's readers below never read it. They are two policies, not one to merge.

## Errors

### `DbParseError`, `DB_PARSE_REASONS`, `IDbParseReason`

**Import:**
```ts
import { DbParseError } from '@axiumine/koa-utils/lib/PostgreSQL/error/DbParseError'
import { DB_PARSE_REASONS } from '@axiumine/koa-utils/lib/PostgreSQL/error/DB_PARSE_REASONS'
import type { IDbParseReason } from '@axiumine/koa-utils/lib/PostgreSQL/error/IDbParseReason'
```

**Signature:**
```ts
export const DB_PARSE_REASONS = ['MALFORMED', 'OUT_OF_RANGE', 'TIME_HAS_SECONDS', 'UNSUPPORTED_TYPE'] as const
export type IDbParseReason = (typeof DB_PARSE_REASONS)[number]
export class DbParseError extends Error {
	readonly reason: IDbParseReason
	readonly typeName: string
	constructor(reason: IDbParseReason, typeName: string)
}
```

The error of the string parsers. `name` is `'DbParseError'` and `message` is `` `database value of type ${typeName} cannot be read: ${reason}` ``. `typeName` is the name `format_type` prints (`date`, `time without time zone`, `bigint[]`, ...). It has no `cause`, and the value that failed is not stored anywhere on it.

| Reason | Meaning |
|---|---|
| `MALFORMED` | the text is not in the shape the type has under the settings the parsers expect (`infinity`, a BC date, another `DateStyle`, a letter in an integer, a second array dimension) |
| `OUT_OF_RANGE` | the text has the shape, but the value is not one the parsers return (`24:00:00`, a day that does not exist, an instant whose UTC year is outside 1 to 9999, an `int8` beyond 64 bits) |
| `TIME_HAS_SECONDS` | a `time` with non-zero seconds or a fraction of a second; refused, never rounded |
| `UNSUPPORTED_TYPE` | the type has no parser here and the driver's own would build a `Date` (`timestamp without time zone` and its array) |

`DbParseError`, `DbConnectError` and every later error of the kit are independent classes with no shared base, so an `instanceof` test names exactly one of them. `instanceof` works across the package boundary only when one copy of this package is installed.

### `DbConnectError`, `DB_CONNECT_REASONS`, `IDbConnectReason`

**Import:**
```ts
import { DbConnectError } from '@axiumine/koa-utils/lib/PostgreSQL/error/DbConnectError'
import { DB_CONNECT_REASONS } from '@axiumine/koa-utils/lib/PostgreSQL/error/DB_CONNECT_REASONS'
import type { IDbConnectReason } from '@axiumine/koa-utils/lib/PostgreSQL/error/IDbConnectReason'
```

**Signature:**
```ts
export const DB_CONNECT_REASONS = ['URL_INVALID', 'CONNECT_TIMEOUT', 'CONNECT_FAILED', 'TIMEZONE_NOT_UTC'] as const
export type IDbConnectReason = (typeof DB_CONNECT_REASONS)[number]
export class DbConnectError extends Error {
	readonly reason: IDbConnectReason
	readonly code: string | undefined
	constructor(reason: IDbConnectReason, code?: string)
}
```

The error `createPool` throws or rejects with. `name` is `'DbConnectError'` and `message` is `` `database connection refused: ${reason}` ``. `code` is the short driver or SQLSTATE code (`ECONNREFUSED`, `28P01`) when it is 1 to 32 letters, digits or underscores, and `undefined` for anything else, so free text never gets in.

| Reason | Meaning |
|---|---|
| `URL_INVALID` | the connection string is not a `postgres://` or `postgresql://` URL the pool accepts |
| `CONNECT_TIMEOUT` | the connection, the login and the session check did not finish in `connectTimeoutMs` |
| `CONNECT_FAILED` | the driver or the server refused (refused connection, name not found, login refused, server shutting down) |
| `TIMEZONE_NOT_UTC` | the session time zone is not `UTC` |

### `sqlstateOf`, `sqlstateField`, `constraintNameOf`, `errorNameOf`

**Import:**
```ts
import { sqlstateOf } from '@axiumine/koa-utils/lib/PostgreSQL/error/sqlstateOf'
import { sqlstateField } from '@axiumine/koa-utils/lib/PostgreSQL/error/sqlstateField'
import { constraintNameOf } from '@axiumine/koa-utils/lib/PostgreSQL/error/constraintNameOf'
import { errorNameOf } from '@axiumine/koa-utils/lib/PostgreSQL/error/errorNameOf'
```

**Signature:**
```ts
export function sqlstateOf(error: unknown): string | undefined
export function sqlstateField(sqlstate: string | undefined): { sqlstate?: string }
export function constraintNameOf(error: unknown): string | undefined
export function errorNameOf(error: unknown): string | undefined
```

Shape-checked reads from an error that came from the driver. They read data, they never throw, and they never read the `message`, the `detail` (which quotes the failing row, so the bound values), the `query` or the `parameters`.

| Function | Answers | `undefined` when |
|---|---|---|
| `sqlstateOf` | the `code` property, if it is exactly five characters of digits and upper-case letters (`23505`, `40P01`) | the value is not an object, or the code has another shape |
| `sqlstateField` | `{ sqlstate }` for a code, `{}` for `undefined`: a ready log field with no key when there is nothing to log | never |
| `constraintNameOf` | the `constraint` property, if it is 1 to 63 letters, digits, `_` or `$` (for a unique index that backs no constraint, the server puts the index name there) | no `constraint`, or a quoted identifier with something unusual in it |
| `errorNameOf` | the `name` property, if it is a letter followed by up to 39 letters, digits or underscores (`TypeError`, `DbConnectError`) | anything else |

```ts
import { constraintNameOf } from '@axiumine/koa-utils/lib/PostgreSQL/error/constraintNameOf'
import { sqlstateField } from '@axiumine/koa-utils/lib/PostgreSQL/error/sqlstateField'
import { sqlstateOf } from '@axiumine/koa-utils/lib/PostgreSQL/error/sqlstateOf'

function describeDriverError(error: unknown): Record<string, unknown> {
	const sqlstate = sqlstateOf(error)
	const constraint = constraintNameOf(error)
	return { ...sqlstateField(sqlstate), ...(constraint === undefined ? {} : { constraint }) }
}
```

## Parsers

By default node-postgres turns `date` and `timestamptz` into a JavaScript `Date`, which depends on the time zone of the process, returns `time` with its seconds, and leaves arrays of these types as raw `{...}` text. The kit's parsers take the text the server sent and return a string, and none of them builds or reads a `Date`. They are opinionated, and the policy is part of the contract:

- **Years 1 to 9999.** A `date` or an instant outside them is refused (`OUT_OF_RANGE`), and BC dates and `infinity` are `MALFORMED`.
- **`time` is `HH:mm` only.** A time with non-zero seconds or a fraction is refused, never rounded, because a silent cut would turn two stored values into one. `24:00:00`, which PostgreSQL accepts, is `OUT_OF_RANGE`.
- **`timestamptz` is UTC with milliseconds.** The parser reads the offset of the session zone the server printed and converts, so a session in another zone gives the same string. Microseconds are cut toward zero on the line of epoch milliseconds, which is what a JavaScript time value does with a fraction; before 1970 that is later in time (`1969-12-31 23:59:59.999999+00` becomes `1970-01-01T00:00:00.000Z`).
- **`int8` stays a string**, checked against the 64-bit range.
- **Text is checked, never guessed.** A text in any other shape (another `DateStyle`, a second array dimension) is `MALFORMED`.

The calendar arithmetic is the algorithm of Howard Hinnant, "chrono-Compatible Low-Level Date Algorithms" (public domain); tests check it against `Date` over the whole range.

**Import:**
```ts
import { parseDate } from '@axiumine/koa-utils/lib/PostgreSQL/parse/parseDate'
import { parseTime } from '@axiumine/koa-utils/lib/PostgreSQL/parse/parseTime'
import { parseTimestamptz } from '@axiumine/koa-utils/lib/PostgreSQL/parse/parseTimestamptz'
import { parseInt8 } from '@axiumine/koa-utils/lib/PostgreSQL/parse/parseInt8'
import { parseUuid } from '@axiumine/koa-utils/lib/PostgreSQL/parse/parseUuid'
import { arrayOf } from '@axiumine/koa-utils/lib/PostgreSQL/parse/arrayOf'
import type { IStringParser } from '@axiumine/koa-utils/lib/PostgreSQL/parse/IStringParser'
import type { IArrayParser } from '@axiumine/koa-utils/lib/PostgreSQL/parse/IArrayParser'
```

**Signature:**
```ts
export type IStringParser = (text: string) => string
export type IArrayParser = (text: string) => (string | null)[]
export const parseDate: IStringParser
export const parseTime: IStringParser
export const parseTimestamptz: IStringParser
export const parseInt8: IStringParser
export const parseUuid: IStringParser
export function arrayOf(element: IStringParser, typeName: string): IArrayParser
```

| Parser | Reads | Returns | Type name in the error |
|---|---|---|---|
| `parseDate` | `YYYY-MM-DD` | the same text | `date` |
| `parseTime` | `HH:MM:SS` with an optional fraction of zeros | `HH:mm` | `time without time zone` |
| `parseTimestamptz` | `YYYY-MM-DD HH:MM:SS[.ffffff]` and an offset (`+00`, `-08`, `+05:30`, `-07:52:58`), optionally ` BC`, a year of up to six digits | `YYYY-MM-DDTHH:mm:ss.SSSZ` | `timestamp with time zone` |
| `parseInt8` | a decimal integer with no sign but `-`, no leading zero | the same text | `bigint` |
| `parseUuid` | the lower case text the server prints | the same text | `uuid` |

`arrayOf(element, typeName)` returns the parser of a one-dimensional array: `{}`, or `{e1,e2,...}` where an element is an unquoted run of characters with no comma, brace, quote, backslash or white space, or a double-quoted string with `\"` and `\\` escapes. An unquoted `NULL`, in any case, is `null`; a quoted `"NULL"` is the text. Each element goes through `element`, so an element error carries the element's type name; an error of the array itself carries `typeName`. A second dimension, a dimension prefix (`[0:1]={...}`) and anything after the closing brace are `MALFORMED`.

```ts
import { arrayOf } from '@axiumine/koa-utils/lib/PostgreSQL/parse/arrayOf'
import { parseDate } from '@axiumine/koa-utils/lib/PostgreSQL/parse/parseDate'

const dates = arrayOf(parseDate, 'date[]')
dates('{2024-03-10,NULL,2024-03-11}') // ['2024-03-10', null, '2024-03-11']
dates('{2024-03-10,infinity}') // throws DbParseError { reason: 'MALFORMED', typeName: 'date' }
```

## Type registry

**Import:**
```ts
import { TYPE_PARSERS } from '@axiumine/koa-utils/lib/PostgreSQL/parse/TYPE_PARSERS'
import { createTypeRegistry } from '@axiumine/koa-utils/lib/PostgreSQL/parse/createTypeRegistry'
import type { IDriverTypes } from '@axiumine/koa-utils/lib/PostgreSQL/parse/IDriverTypes'
import type { ITypeParserEntry } from '@axiumine/koa-utils/lib/PostgreSQL/parse/ITypeParserEntry'
```

**Signature:**
```ts
export interface IDriverTypes {
	getTypeParser(oid: number, format?: 'text' | 'binary'): (value: string) => unknown
}
export interface ITypeParserEntry {
	readonly oid: number
	readonly typeName: string
	readonly parse: (text: string) => unknown
}
export const TYPE_PARSERS: readonly ITypeParserEntry[]
export function createTypeRegistry(driverTypes: IDriverTypes): IDriverTypes
```

`TYPE_PARSERS` lists the parsers by the OID of the type they read: `bigint` (20), `date` (1082), `time without time zone` (1083), `timestamp with time zone` (1184) and the arrays `bigint[]` (1016), `date[]` (1182), `time without time zone[]` (1183), `timestamp with time zone[]` (1185), `uuid[]` (2951). Arrays are separate types in PostgreSQL (the OID of `date[]` is not the OID of `date`), so each has its own entry. `timestamp without time zone` (1114) and its array (1115) are present too, with a parser that always throws `UNSUPPORTED_TYPE`: the driver's own would build a `Date`.

`createTypeRegistry(driverTypes)` returns the object to pass as the `types` option of a pool: it answers the library's parser for these OIDs in text format and the driver's for everything else, including every binary request. The driver is asked on each call, so a parser registered on it later is seen for the types this library does not parse. It is a new object per call and it never calls `types.setTypeParser`, which writes the process-wide registry of the driver; the parsers of one pool are not seen by another pool, by a plain `new Pool()`, or by `pg.types.getTypeParser`. `createPool` does this for you.

## Pool

### `createPool`

**Import:** `import { createPool } from '@axiumine/koa-utils/lib/PostgreSQL/pool/createPool'`

**Signature:**
```ts
export function createPool<TPool extends IPoolEvents>(options: ICreatePoolOptions<TPool>): TPool
```

Makes the pool of a service and returns the instance of the driver's own `Pool` class, so your types (`pg.Pool`) apply. It does these things, in the order a connection meets them:

1. The driver is a parameter; the module imports nothing from `pg`.
2. The URL is checked before the driver sees it, and the driver gets it only through `connectionString`. The query may hold `sslmode` and `sslrootcert` (each once) and nothing else, because node-postgres lets a URL parameter replace a pool setting (`application_name`, `host`, `user`). A URL that fails throws `DbConnectError` `URL_INVALID` with no part of the URL in it.
3. Every client of the pool is an instance of a subclass of the driver's `Client`. Its `connect` runs, in the promise form and in the callback form pg-pool uses, the driver's connect, the login and `SHOW timezone`, all inside one deadline of `connectTimeoutMs`. The answer must be `UTC` (a role-level `timezone` setting is the usual way to guarantee it). A failure of any step counts `db_pool_connect_failures_total`, logs `warn` `database connection refused` with the closed `reason` (and the short `errorCode` when there is one), ends the client (without waiting for it), and rejects the checkout with a `DbConnectError`. The text of the driver, which can quote the URL, is dropped.
4. The parsers of `createTypeRegistry` are the `types` option of this pool only.
5. The `error` event of an idle client, which Node would otherwise throw and end the process, gets a listener: it counts `db_pool_idle_client_errors_total` and logs `error` `database pool idle client error` with `reason: 'IDLE_CLIENT_ERROR'`, the `errorCode` when the error has a string `code`, and `detail`, the driver's message with the URL and the password (raw and percent-decoded) replaced by `[REDACTED]`.

The driver's `connectionTimeoutMillis` is not passed: it bounds the socket and the login only, and a server that logs in and never answers the first query would hang the check. The deadline here covers all three steps and has its own reason.

Throws `TypeError` for a parameter out of range (before anything is created, in the order of the table below) and `DbConnectError` `URL_INVALID`.

```ts
import { createPool } from '@axiumine/koa-utils/lib/PostgreSQL/pool/createPool'
import pg from 'pg'

const pool = createPool({
	driver: pg,
	url: process.env['DATABASE_URL'] ?? '',
	max: 10,
	applicationName: 'orders-api',
	logger: { warn: (message, fields) => console.warn(message, fields), error: (message, fields) => console.error(message, fields) },
	counter: (name) => console.info('count', name)
})
```

**Options (`ICreatePoolOptions`):**

| Name | Type | Description |
|---|---|---|
| driver | `IDbDriver<TPool>` | The node-postgres module (`Client`, `Pool`, `types`). |
| url | `string` | `postgres://role[:password]@host:port/database`, optional query of `sslmode` and `sslrootcert`. |
| max | `number` | Most connections; a whole number from 1. |
| applicationName | `string` | `application_name` of every session; 1 to 63 of `A-Z a-z 0-9 _ . : -`, starting with a letter or digit. |
| logger | `IPoolLogger` | `{ warn, error }`, each `(message: string, fields?: Readonly<Record<string, unknown>>) => void`. |
| counter | `IPoolCounter` | Optional. Called once per event with `db_pool_idle_client_errors_total` or `db_pool_connect_failures_total`. Default: nowhere. |
| connectTimeoutMs | `number` | Optional deadline of connect, login and check; a whole number from 1. Default `DEFAULT_CONNECT_TIMEOUT_MS`. |
| keepAlive | `boolean` | Optional TCP keepalive. Default `true`. |
| keepAliveInitialDelayMs | `number` | Optional idle time before the first probe; a whole number from 0. Default `DEFAULT_KEEPALIVE_INITIAL_DELAY_MS`. |

### Pool constants and types

| Subpath | Export | Value or shape |
|---|---|---|
| `pool/DEFAULT_CONNECT_TIMEOUT_MS` | `DEFAULT_CONNECT_TIMEOUT_MS` | `5_000` |
| `pool/DEFAULT_KEEPALIVE_INITIAL_DELAY_MS` | `DEFAULT_KEEPALIVE_INITIAL_DELAY_MS` | `10_000` |
| `pool/REQUIRED_SESSION_TIME_ZONE` | `REQUIRED_SESSION_TIME_ZONE` | `'UTC'` |
| `pool/ICreatePoolOptions` | `ICreatePoolOptions<TPool>` | the options above |
| `pool/IDbDriver` | `IDbDriver<TPool>` | `{ readonly Client: new (config: never) => unknown; readonly Pool: new (config: never) => TPool; readonly types: IDriverTypes }` |
| `pool/IPoolEvents` | `IPoolEvents` | `{ on(event: 'error', listener: (error: Error) => void): unknown }` |
| `pool/IPoolLogger` | `IPoolLogger` | `{ warn(...): void; error(...): void }` |
| `pool/IPoolCounter` | `IPoolCounter` | `IDbCounter<IPoolCounterName>` |
| `pool/IPoolCounterName` | `IPoolCounterName` | `'db_pool_idle_client_errors_total' \| 'db_pool_connect_failures_total'` |
| `counter/IDbCounter` | `IDbCounter<TName extends string = string>` | `(name: TName) => void` |

`IDbCounter` is generic over the name so each part of the kit narrows it to the names it emits. A counter typed over a wider closed list, such as `(name: 'a' | 'b') => void`, is assignable to `IDbCounter<'a'>`, so you can pass one counter function everywhere without an adapter. The kit keeps no registry and exposes no metrics endpoint: you decide where a count goes.

## Database URL check

### `databaseUrlReason`

**Import:**
```ts
import { databaseUrlReason } from '@axiumine/koa-utils/lib/PostgreSQL/url/databaseUrlReason'
import { LOOPBACK_HOSTS } from '@axiumine/koa-utils/lib/PostgreSQL/url/LOOPBACK_HOSTS'
import type { IDatabaseUrlOptions } from '@axiumine/koa-utils/lib/PostgreSQL/url/IDatabaseUrlOptions'
import type { IDatabaseUrlReason } from '@axiumine/koa-utils/lib/PostgreSQL/url/IDatabaseUrlReason'
```

**Signature:**
```ts
export interface IDatabaseUrlOptions {
	readonly expectedRole: string
	readonly allowPlainLoopback: boolean
}
export type IDatabaseUrlReason =
	| 'url_syntax' | 'url_scheme' | 'url_user' | 'url_role' | 'url_host' | 'url_port' | 'url_database' | 'url_query' | 'url_tls'
export function databaseUrlReason(text: string, options: IDatabaseUrlOptions): IDatabaseUrlReason | undefined
export const LOOPBACK_HOSTS: readonly string[] // ['127.0.0.1', '::1', 'localhost']
```

Answers `undefined` when the URL is acceptable, otherwise the first reason it is not, as a closed word that never contains a part of the URL. The checks run in this order:

| Reason | Fails when |
|---|---|
| `url_syntax` | whitespace, a control character or a backslash; not parseable (a port above 65535 included: the parser refuses it); a fragment (`#...`) |
| `url_scheme` | not `postgres://` or `postgresql://` (lower case) |
| `url_user` | no user, or a user that is not a plain identifier (letters, digits, `_`, `-`; no percent-escape) |
| `url_role` | the user is not exactly `expectedRole` |
| `url_host` | not a host name or an IP address (see `isValidHost`) |
| `url_port` | no explicit port, or port 0 |
| `url_database` | no database name, or one that is not a plain identifier (so `/a/b` fails) |
| `url_query` | a parameter other than `sslmode` and `sslrootcert`, one given twice, or a `sslrootcert` that is not an absolute path (see `isAbsolutePath`) |
| `url_tls` | no `sslmode=verify-full`, except a loopback host (`LOOPBACK_HOSTS`, compared in lower case) when `allowPlainLoopback` is `true` |

The URL is read strictly because node-postgres reads a connection string with the WHATWG `URL` parser and then copies every query parameter over the parsed parts: `?host=`, `?port=`, `?user=` and `?password=` replace the host, the port, the user and the password of the URL itself, `?ssl=0` and `?sslmode=` change TLS, and `?uselibpqcompat=true` changes what `sslmode` means. A check that looked only at the authority would pass a URL that connects somewhere else, under another login, without TLS. This function uses the same `URL` parser as the driver, and the query is an allow-list.

`allowPlainLoopback` is yours to compute, from whatever environment signal you have (a disposable local database, a CI service container); the function reads no environment variable. A host that is not loopback needs `verify-full` whatever you pass.

```ts
import { databaseUrlReason } from '@axiumine/koa-utils/lib/PostgreSQL/url/databaseUrlReason'

const url = 'postgres://app_role@db.internal:5432/app?sslmode=verify-full'
databaseUrlReason(url, { expectedRole: 'app_role', allowPlainLoopback: false }) // undefined
databaseUrlReason(url, { expectedRole: 'worker_role', allowPlainLoopback: false }) // 'url_role'
databaseUrlReason('postgres://app_role@127.0.0.1:5432/app', { expectedRole: 'app_role', allowPlainLoopback: true }) // undefined
```

### `isValidHost`, `isAbsolutePath`

**Import:**
```ts
import { isValidHost } from '@axiumine/koa-utils/lib/PostgreSQL/url/isValidHost'
import { isAbsolutePath } from '@axiumine/koa-utils/lib/PostgreSQL/url/isAbsolutePath'
```

**Signature:**
```ts
export function isValidHost(text: string): boolean
export function isAbsolutePath(text: string): boolean
```

`isValidHost` is true for a host name (labels of letters, digits and hyphens, none starting or ending with a hyphen, each at most 63 characters, the whole at most 253), an IPv4 address or an IPv6 address. A scheme, a port, a path, a user, a bracket, a zone id (`fe80::1%eth0`), an underscore and a trailing dot are refused, and so is a name whose last label is all digits (`127.1`, `999.1.1.1`, `8080`), which a resolver may read as an address. It uses `node:net`'s `isIP`.

`isAbsolutePath` is true for a POSIX path that starts with `/`, has no `..` segment and no ASCII control character (below `0x20`, or `0x7f`). A space or a non-ASCII character is allowed.

## Single copy of the package

The errors are plain classes, so `error instanceof DbConnectError` is true only for errors made by the same installed copy of this package. If two copies end up in one dependency tree (two versions pinned by two of your dependencies), an error from one copy is not an `instanceof` of the other. Keep one version installed.
