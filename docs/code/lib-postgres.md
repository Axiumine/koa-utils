# Lib — PostgreSQL Kit

A kit of small, driver-agnostic building blocks for services that talk to PostgreSQL through [node-postgres](https://node-postgres.com) (`pg`): a pool factory that checks the session before it hands a connection out, a transaction wrapper with a bounded retry, a mapper from a driver error to your own error family, guards for writes that matched nothing, string parsers for the date and integer types that would otherwise become a JavaScript `Date` or lose digits, closed-reason errors that never carry a password or a row, and a strict check for a database URL. It is separate from `dataSources/PostgreSQL` (the environment-driven singletons, see [data-sources.md](./data-sources.md)) and from `lib/PostgreSQL/IPostgresError` and `makePostgreSqlLogError` (documented in [lib-datasource-errors.md](./lib-datasource-errors.md)): nothing in this kit reads an environment variable or opens a connection on import.

This page covers the leaf pieces (errors, parsers, type registry, pool, database URL check), the transaction wrapper `withTx`, the error mapper `mapDbError` with its constraint helpers, the write guards `assertAffected` and `guardVersion`, the boot check of the database role, `assertRole`, and the pieces for time and locks inside one transaction: the server clock `createDbClock` with `lockTaken`, the lock-order tracker `createLockOrderTracker`, and the small helpers for writing lock helpers (`uuidOf`, `uuidsOf`, `rowLockModeOf`, `lockedRow`, `lockedRows`, `claimRowsSkipLocked`). The kit ships no lock helper of its own: it ships the parts you build yours from.

## Principles

- **The driver is a parameter.** No file in the kit imports `pg`, and no `.d.mts` names it. `createPool` takes the module you imported (`import pg from 'pg'`) as `driver` and uses three members of it through structural types (`IDbDriver`). Importing any subpath of the kit therefore loads no peer dependency and needs none installed, `pg` included.
- **Structural seams.** A logger is any object with `warn` and `error` (`IPoolLogger`). A counter is any function of the counter name (`IDbCounter`). An error factory is any object that builds your own error class for a code or a closed reason (`IDbErrorFactory`), so the kit imports no error class of your application. A constraint table is plain data that you pass in (`IConstraintTable`); the kit ships none. Nothing is a class you must extend.
- **Closed reasons, fixed messages.** Every error and every check answers with a word from a closed list. A message is built from the reason and the name of a type, never from a stored value, a URL or the text of the driver, so a password or a row cannot reach a log line through them. No error here has a `cause`.
- **One export per file.** Each value has its own subpath, and its types live in `I*` files. There is no barrel.
- **No lock clause, no session lock.** No file of the kit issues `FOR UPDATE`, `FOR SHARE`, `SKIP LOCKED` or an advisory lock, and none exports one as statement text. The one statement of the kit that reads the clock, `CLOCK_SQL`, is a plain `SELECT`. Lock clauses live in your own helpers, where one grep finds them. The rank each of your helpers takes is checked by a tracker you build from your own spec, and a claim runs only a statement from a closed registry you wrote.

## Layout and names

All subpaths are `@axiumine/koa-utils/lib/PostgreSQL/<folder>/<File>`. The file name is the export name; a type file starts with `I`.

| Folder | Holds |
|---|---|
| `error/` | `DbParseError`, `DbConnectError`, `DbTxError`, `RoleAssertionError`, `DbClockError`, `LockOrderError`, `DbStateError`, their reason lists and types, `IDbErrorFactory`, the SQLSTATE readers (`sqlstateOf`, `sqlstateField`, `constraintNameOf`, `errorNameOf`), `mapDbError` and its options and counter types, `DB_INTERNAL_REASONS`, and the constraint helpers (`buildConstraintEntry`, `lookupConstraint`, `IConstraintEntry`, `IConstraintTable`, `IConstraintEntryBuilder`) |
| `parse/` | the string parsers, `arrayOf`, and the type registry (`TYPE_PARSERS`, `createTypeRegistry`) |
| `pool/` | `createPool`, its options and constants |
| `counter/` | `IDbCounter`, the counter callback type |
| `url/` | `databaseUrlReason` and the host and path checks it uses |
| `tx/` | `withTx`, `jitteredDelay`, `defaultRetryDelay`, the transaction constants, and the types of the handle, the pool, the client and the options |
| `guard/` | `assertAffected` and `guardVersion` for a write that matched no row, `VERSION_GUARD_FIELDS`, and their input, code and counter types |
| `role/` | `assertRole`, the boot check that the connected role has exactly the expected attributes, ownership, memberships and grants, and the types of its options, its pool and its answer (`RoleAssertionError` is in `error/`) |
| `clock/` | `createDbClock`, `lockTaken`, `CLOCK_SQL`, `DB_NOW_SQL`, and the types of the clock, its options and its seam (`DbClockError` is in `error/`) |
| `lock/` | `createLockOrderTracker`, `claimRowsSkipLocked`, `lockedRow`, `lockedRows`, `uuidOf`, `uuidsOf`, `rowLockModeOf`, `ROW_LOCK_MODES`, `CLAIM_LIMIT_MAX`, and the types of the spec, the tracker and the claim (`LockOrderError` is in `error/`) |

Types are named `I<Name>`. When you move code that used the unprefixed names of a private copy, the mapping is:

| Unprefixed name | Name here |
|---|---|
| `DbDriver` | `IDbDriver` |
| `PoolEvents` | `IPoolEvents` |
| `CreatePoolOptions` | `ICreatePoolOptions` |
| `StringParser`, `ArrayParser` | `IStringParser`, `IArrayParser` |
| `DriverTypes` | `IDriverTypes` |
| `TypeParserEntry` | `ITypeParserEntry` |
| `DbParseReason`, `DbConnectReason`, `DbTxReason` | `IDbParseReason`, `IDbConnectReason`, `IDbTxReason` |
| `DatabaseUrlContext`, `DatabaseUrlReason` | `IDatabaseUrlOptions`, `IDatabaseUrlReason` |
| `Tx`, `TxResult`, `TxClient`, `TxPool`, `TxOptions` | `ITx`, `ITxResult`, `ITxClient`, `ITxPool`, `ITxOptions` |
| `TxIsolation`, `TxFailureReason`, `RetryDelay` | `ITxIsolation`, `ITxFailureReason`, `IRetryDelay` |
| `DbErrorFactory` | `IDbErrorFactory` |
| `DbInternalReason`, `MapDbErrorOptions` | `IDbInternalReason`, `IMapDbErrorOptions` |
| `ConstraintEntry`, `ConstraintTable` | `IConstraintEntry`, `IConstraintTable` |
| `AffectedResult`, `VersionGuardField`, `VersionGuardInput` | `IAffectedResult`, `IVersionGuardField`, `IVersionGuardInput` |
| `RoleGrant`, `AssertRoleOptions`, `RolePool`, `RoleAssertion` | `IRoleGrant`, `IAssertRoleOptions`, `IRolePool`, `IRoleAssertion` |
| `RoleAssertionReason`, `RoleAssertionSubject` | `IRoleAssertionReason`, `IRoleAssertionSubject` |
| `Clock`, `DbClock`, `DbClockOptions`, `DbClockReason` | `IClock`, `IDbClock`, `IDbClockOptions`, `IDbClockReason` |
| `LockOrderReason`, `RowLockMode`, `ClaimRequest` | `ILockOrderReason`, `IRowLockMode`, `IClaimRequest` |

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

### `DbTxError`, `DB_TX_REASONS`, `IDbTxReason`

**Import:**
```ts
import { DbTxError } from '@axiumine/koa-utils/lib/PostgreSQL/error/DbTxError'
import { DB_TX_REASONS } from '@axiumine/koa-utils/lib/PostgreSQL/error/DB_TX_REASONS'
import type { IDbTxReason } from '@axiumine/koa-utils/lib/PostgreSQL/error/IDbTxReason'
```

**Signature:**
```ts
export const DB_TX_REASONS = ['HANDLE_CLOSED', 'COMMIT_ROLLED_BACK'] as const
export type IDbTxReason = (typeof DB_TX_REASONS)[number]
export class DbTxError extends Error {
	readonly reason: IDbTxReason
	constructor(reason: IDbTxReason)
}
```

The error of a misused transaction, both reasons a defect of the calling code. `name` is `'DbTxError'` and `message` is `` `database transaction misused: ${reason}` ``. No `cause`.

| Reason | Meaning |
|---|---|
| `HANDLE_CLOSED` | a statement was sent through the handle of a transaction that has already committed, rolled back or started to commit |
| `COMMIT_ROLLED_BACK` | the server answered `COMMIT` with the command tag `ROLLBACK` (what it does for a transaction that a failed statement aborted) and no failed statement of the handle is known to say why |

### `RoleAssertionError`, `ROLE_ASSERT_REASONS`, `IRoleAssertionReason`, `IRoleAssertionSubject`

**Import:**
```ts
import { RoleAssertionError } from '@axiumine/koa-utils/lib/PostgreSQL/error/RoleAssertionError'
import { ROLE_ASSERT_REASONS } from '@axiumine/koa-utils/lib/PostgreSQL/error/ROLE_ASSERT_REASONS'
import type { IRoleAssertionReason } from '@axiumine/koa-utils/lib/PostgreSQL/error/IRoleAssertionReason'
import type { IRoleAssertionSubject } from '@axiumine/koa-utils/lib/PostgreSQL/error/IRoleAssertionSubject'
```

**Signature:**
```ts
export const ROLE_ASSERT_REASONS: readonly [
	'INVALID_EXPECTATION', 'ROLE_MISMATCH', 'ROLE_SUPERUSER', 'ROLE_CREATEROLE', 'ROLE_CREATEDB', 'ROLE_BYPASSRLS',
	'ROLE_REPLICATION', 'ROLE_OWNS_OBJECTS', 'ROLE_MEMBERSHIP', 'SESSION_ROLE_DIFFERS', 'GRANT_MISSING', 'CHECK_FAILED'
]
export type IRoleAssertionReason = (typeof ROLE_ASSERT_REASONS)[number]
export interface IRoleAssertionSubject {
	readonly object?: string | undefined
	readonly privilege?: string | undefined
	readonly column?: string | undefined
	readonly code?: string | undefined
}
export class RoleAssertionError extends Error {
	readonly reason: IRoleAssertionReason
	readonly role: string
	readonly object: string | undefined
	readonly privilege: string | undefined
	readonly column: string | undefined
	readonly code: string | undefined
	constructor(reason: IRoleAssertionReason, role: string, subject?: IRoleAssertionSubject)
}
```

The error of [`assertRole`](#assertrole). `name` is `'RoleAssertionError'` and `message` is `` `role assertion failed for ${role}: ${reason}` `` followed by a subject in parentheses for three reasons: `GRANT_MISSING` (`(SELECT on app.orders)`, or `(UPDATE on app.items column locale)` for a column-level grant), `ROLE_MEMBERSHIP` (`(member of owner_role)`) and `CHECK_FAILED` with a code (`(42501)`). A part that was not given prints as `?`. Every name passes a shape check before it is printed or stored: letters, digits, `_`, `$` and `.`, starting with a letter or `_`, at most 127 characters. A text that fails it, such as a connection string passed as a role name by mistake, is stored and printed as `?`, and the same goes for a `role` that is not a string at all. `code` is kept only when it is 1 to 32 letters, digits or underscores. No `cause`: the driver error behind a `CHECK_FAILED` can quote an argument, and is not kept. The reasons are listed under [`assertRole`](#assertrole).

### `IDbErrorFactory`

**Import:** `import type { IDbErrorFactory } from '@axiumine/koa-utils/lib/PostgreSQL/error/IDbErrorFactory'`

**Signature:**
```ts
export interface IDbErrorFactory<TError extends Error = Error> {
	is(error: unknown): error is TError
	make(code: string, details?: unknown): TError
	internal(reason: string): TError
}
```

The one error-factory port of the kit. A part of the kit that has to hand its caller an error of the application's own family (an HTTP error with a code and details, say) asks this object for it instead of importing a class, so the kit stays free of your error types. `withTx` reads `internal` only (`ITxOptions['errors']` is `Pick<IDbErrorFactory, 'internal'>`, so an object with just `internal` fits); `guardVersion` reads `make` and `internal`; `mapDbError` reads all three members. `assertAffected` builds no error: it throws the one you pass it. `reason` is a closed word meant for a log, not for a response body.

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

## Transactions

### `withTx`

**Import:** `import { withTx } from '@axiumine/koa-utils/lib/PostgreSQL/tx/withTx'`

**Signature:**
```ts
export function withTx<T>(pool: ITxPool, options: ITxOptions, fn: (tx: ITx) => Promise<T>): Promise<T>
```

The one transaction wrapper, so that no caller writes its own isolation, lock timeout or retry loop. `pool` is any object with `connect(): Promise<ITxClient>`: the `pg.Pool` that `createPool` returns has it, and so does any pool that hands out `pg.PoolClient`s. Nothing is imported from `pg`.

What one attempt does, in order:

1. Checks a connection out of the pool and listens to its `error` event for as long as it holds it. A connection that dies under a running transaction would otherwise emit an event nobody handles, and Node ends the process on that. The event counts `db_tx_client_errors_total`, logs `error` `database client error during transaction` with `reason: 'CLIENT_ERROR'` and the SQLSTATE when there is a safe one, and marks the connection to be destroyed.
2. `BEGIN ISOLATION LEVEL <level> [READ ONLY]`, the text taken from a closed table (never built), then `SET LOCAL lock_timeout = <ms>`. `SET LOCAL` is the only form of `SET` in the module: the value ends with the transaction, so the role-level value is back for the next user of the connection, and a transaction pooler stays usable.
3. Runs `fn` with a handle that has one member, `query`. The handle is frozen. The pool and the connection are not reachable from it, and it stops working when the transaction ends, so a statement cannot run outside the transaction, not even through a handle that `fn` kept (it is refused with `DbTxError` `HANDLE_CLOSED`).
4. `COMMIT` when `fn` resolved, `ROLLBACK` when anything threw. A rollback that fails does not hide the error that caused it: the original error is thrown, the connection is destroyed instead of returned to the pool, `db_tx_rollback_failures_total` is counted and `database transaction rollback failed` is logged with `reason: 'ROLLBACK_FAILED'`.

What the loop does with a failure of an attempt, by SQLSTATE:

| SQLSTATE | Meaning | What the caller gets |
|---|---|---|
| `40001` | serialisation failure | `fn` runs again in a fresh transaction on a fresh checkout, after `retryDelay`, up to `retryMax` retries. After the last one fails too: `errors.internal('TX_RETRY_EXHAUSTED')` |
| `40P01` | deadlock detected | the same as `40001` |
| `55P03` | lock not available (the lock timeout) | no retry: `errors.internal('LOCK_TIMEOUT')` |
| anything else, or no SQLSTATE | | the error unchanged (the same object), after the rollback |

Each retry counts `db_tx_retries_total` and logs `warn` `database transaction retried` with `reason: 'TX_RETRY'`, `sqlstate` and `retry` (1 for the first). The failures that end the loop count `db_tx_retry_exhausted_total` or `db_tx_lock_timeouts_total` and log `error` `database transaction failed` with `reason`, `sqlstate` and `attempts`. The factory is asked for the reason and nothing else: no driver message, no constraint name, no `cause`, so nothing the driver wrote can reach the error the caller sees.

**A swallowed failure is not a success.** If `fn` catches the error of a statement and resolves, the transaction is aborted and the server answers `COMMIT` with the tag `ROLLBACK`. The wrapper reads the tag and throws the first failed statement of the handle (which then goes through the table above, so a swallowed deadlock is still retried), or `DbTxError` `COMMIT_ROLLED_BACK` when none is known. Recover with a savepoint (`ROLLBACK TO SAVEPOINT`) if you mean to continue.

`fn` may run more than once, so it must hold no state that a failed run leaves behind. `withTx` rejects with `TypeError` for an option out of range, before a connection is taken; the checks run in the order isolation, lock timeout, retry count.

```ts
import pg from 'pg'
import type { IDbErrorFactory } from '@axiumine/koa-utils/lib/PostgreSQL/error/IDbErrorFactory'
import { createPool } from '@axiumine/koa-utils/lib/PostgreSQL/pool/createPool'
import { withTx } from '@axiumine/koa-utils/lib/PostgreSQL/tx/withTx'

class AppError extends Error {
	constructor(
		readonly code: string,
		readonly details?: unknown
	) {
		super(code)
	}
}

const errors: IDbErrorFactory<AppError> = {
	is: (error): error is AppError => error instanceof AppError,
	make: (code, details) => new AppError(code, details),
	internal: (reason) => new AppError('INTERNAL', { reason })
}

const logger = {
	warn: (message: string, fields?: Readonly<Record<string, unknown>>) => console.warn(message, fields),
	error: (message: string, fields?: Readonly<Record<string, unknown>>) => console.error(message, fields)
}

const pool = createPool({ driver: pg, url: process.env['DATABASE_URL'] ?? '', max: 10, applicationName: 'orders-api', logger })

const total = await withTx(pool, { logger, errors, isolation: 'REPEATABLE READ', readOnly: true }, async (tx) => {
	const { rows } = await tx.query<{ n: string }>('SELECT count(*)::text AS n FROM orders WHERE customer_id = $1', [42])
	return rows[0]?.n ?? '0'
})
```

**Options (`ITxOptions`):**

| Name | Type | Description |
|---|---|---|
| logger | `IPoolLogger` | `{ warn, error }`, the same shape `createPool` takes. The retries and the failures are written to it. |
| errors | `Pick<IDbErrorFactory, 'internal'>` | Builds the error the caller gets when the loop gives up. Required: the kit cannot make an error of your family without it. |
| counter | `ITxCounter` | Optional. Called once per event with one of `db_tx_retries_total`, `db_tx_retry_exhausted_total`, `db_tx_lock_timeouts_total`, `db_tx_rollback_failures_total`, `db_tx_client_errors_total`. Default: nowhere. |
| isolation | `ITxIsolation` | Optional. `'READ COMMITTED'` (default), `'REPEATABLE READ'` or `'SERIALIZABLE'`. `READ UNCOMMITTED` is the server's alias of `READ COMMITTED` and is not offered. |
| readOnly | `boolean` | Optional. Adds `READ ONLY` at the requested isolation; a write then fails with SQLSTATE `25006`. Default `false`. |
| lockTimeoutMs | `number` | Optional. `SET LOCAL lock_timeout`, a whole number of milliseconds from 1 to `MAX_LOCK_TIMEOUT_MS`. Default `DEFAULT_LOCK_TIMEOUT_MS`. |
| retryMax | `number` | Optional. How many times `fn` is run again after 40001 or 40P01, a whole number from 0 to `TX_RETRY_MAX_CEILING`. Default `TX_RETRY_MAX`. |
| retryDelay | `IRetryDelay` | Optional. The wait before retry number `retry`. Default `defaultRetryDelay`. |

### `jitteredDelay`, `defaultRetryDelay`

**Import:**
```ts
import { jitteredDelay } from '@axiumine/koa-utils/lib/PostgreSQL/tx/jitteredDelay'
import { defaultRetryDelay } from '@axiumine/koa-utils/lib/PostgreSQL/tx/defaultRetryDelay'
import type { IRetryDelay } from '@axiumine/koa-utils/lib/PostgreSQL/tx/IRetryDelay'
```

**Signature:**
```ts
export type IRetryDelay = (retry: number) => Promise<void>
export function jitteredDelay(random?: (maxExclusive: number) => number): IRetryDelay
export const defaultRetryDelay: IRetryDelay
```

`jitteredDelay(random)` waits a random length from 0 to `TX_RETRY_BASE_DELAY_MS` times two to the power of the retry number minus one, both ends included ("full jitter"), so that two transactions that collided do not collide again in step: 0 to 25 ms before the first retry, 0 to 50 ms before the second, 0 to 100 ms before the third. `random(n)` answers a whole number from 0 up to `n`, `n` excluded; the default is `randomInt` of `node:crypto`. `defaultRetryDelay` is `jitteredDelay()`. Pass `retryDelay: () => Promise.resolve()` to `withTx` in a test that should wait for nothing.

```ts
import { jitteredDelay } from '@axiumine/koa-utils/lib/PostgreSQL/tx/jitteredDelay'

// a wait of exactly the longest length the range holds, for a reproducible test
const slowest = jitteredDelay((maxExclusive) => maxExclusive - 1)
await slowest(2) // 50 ms
```

### Transaction constants and types

| Subpath | Export | Value or shape |
|---|---|---|
| `tx/DEFAULT_LOCK_TIMEOUT_MS` | `DEFAULT_LOCK_TIMEOUT_MS` | `3_000` |
| `tx/MAX_LOCK_TIMEOUT_MS` | `MAX_LOCK_TIMEOUT_MS` | `2_147_483_647` (the server takes a 32-bit count of milliseconds) |
| `tx/TX_RETRY_MAX` | `TX_RETRY_MAX` | `2` |
| `tx/TX_RETRY_MAX_CEILING` | `TX_RETRY_MAX_CEILING` | `10` |
| `tx/TX_RETRY_BASE_DELAY_MS` | `TX_RETRY_BASE_DELAY_MS` | `25` |
| `tx/TX_ISOLATION_LEVELS` | `TX_ISOLATION_LEVELS` | `['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'] as const` |
| `tx/TX_FAILURE_REASONS` | `TX_FAILURE_REASONS` | `['TX_RETRY_EXHAUSTED', 'LOCK_TIMEOUT'] as const` |
| `tx/ITxIsolation` | `ITxIsolation` | one of `TX_ISOLATION_LEVELS` |
| `tx/ITxFailureReason` | `ITxFailureReason` | one of `TX_FAILURE_REASONS` |
| `tx/ITx` | `ITx` | `{ query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<ITxResult<TRow>> }` |
| `tx/ITxResult` | `ITxResult<TRow>` | `{ readonly rows: TRow[]; readonly rowCount: number \| null; readonly command: string }` |
| `tx/ITxClient` | `ITxClient` | `query`, `on('error', listener)`, `removeListener('error', listener)` and `release(destroy?: boolean)`: the `pg.PoolClient` has all of it |
| `tx/ITxPool` | `ITxPool` | `{ connect(): Promise<ITxClient> }`: the `pg.Pool` has it |
| `tx/ITxOptions` | `ITxOptions` | the options above |
| `tx/ITxCounter` | `ITxCounter` | `IDbCounter<ITxCounterName>` |
| `tx/ITxCounterName` | `ITxCounterName` | the five `db_tx_*_total` names above |
| `tx/IRetryDelay` | `IRetryDelay` | `(retry: number) => Promise<void>` |

`TX_FAILURE_REASONS` are the two reasons `withTx` passes to `errors.internal`. As with the pool counter, a counter typed over a wider list of names, such as `(name: ITxCounterName | IPoolCounterName) => void`, is assignable to `ITxCounter`, so one counter function serves `createPool` and `withTx`.

## Mapping driver errors

### `mapDbError`

**Import:**
```ts
import { mapDbError } from '@axiumine/koa-utils/lib/PostgreSQL/error/mapDbError'
import type { IMapDbErrorOptions } from '@axiumine/koa-utils/lib/PostgreSQL/error/IMapDbErrorOptions'
```

**Signature:**
```ts
export function mapDbError<TError extends Error>(error: unknown, options: IMapDbErrorOptions<TError>): TError
```

The one translation of a database failure into the closed vocabulary of your own error family, so that the catch block of a handler is `throw mapDbError(error, { errors, table, logger })`. It answers an error built by `options.errors` for every input and does not throw. The result type is the family of the factory, so the call site sees `AppError`, not `Error`.

What it does, in order:

| Step | Input | Result |
|---|---|---|
| 1 | an error for which `errors.is` is true (what `withTx` throws, or an error of yours) | the same object, with no log line and no count |
| 2 | `DbParseError` | `errors.internal('DB_VALUE_UNREADABLE')`; logs `database value cannot be read` with `errorReason` and `typeName` |
| 2 | `DbConnectError` | `errors.internal('DB_CONNECTION')`; logs `database connection refused` with `errorReason` |
| 2 | `DbTxError` | `errors.internal('DB_TX_MISUSE')`; logs `database transaction misused` with `errorReason` |
| 3 | SQLSTATE `23505` (unique), `23514` (check) or `23503` (foreign key), constraint found in `options.table` | `errors.make(code, details)` (or `errors.make(code)` when the row has no details), with the details the row fixes and the keys the caller supplied |
| 3 | one of those SQLSTATEs, and the name is missing, not a plain identifier, or not in the table | `errors.internal('CONSTRAINT_UNMAPPED')`; counts `db_constraint_unmapped_total`; logs `database constraint violation is not in the constraint map` with `sqlstate` and, when it is a plain identifier, `constraint` |
| 3 | a row whose code is the internal code | `errors.internal('CONSTRAINT_INTERNAL')`; logs `database constraint violation is a defect` |
| 3 | a row that lists `supplied` keys the caller did not give (a key whose value is `undefined` is missing) | `errors.internal('DETAILS_NOT_SUPPLIED')`; logs `database constraint violation needs details that the caller did not supply` |
| 4 | any other safe SQLSTATE | `errors.internal('DB_ERROR')`; logs `database error` with `sqlstate` |
| 4 | anything else (a `TypeError`, an error of another library, a value that is no error) | `errors.internal('UNEXPECTED_ERROR')`; logs `unexpected error at the database boundary` with `errorName` when the class name is a plain identifier |

Every internal error of this function is asked for a reason from `DB_INTERNAL_REASONS` and nothing else. Each one counts `db_error_internal_total` (the unmapped constraint counts `db_constraint_unmapped_total` instead) and logs at `error` level a payload that starts with `reason`. Nothing else of the failure is read: not the message, not the `detail` (it quotes the failing row, so the bound values), not `query`, `values` or `parameters` if a wrapper put them on the error, not the stack. The specs plant a secret in each of those fields and look for it in the result, its serialisations and every log line.

**Options (`IMapDbErrorOptions<TError>`):**

| Name | Type | Description |
|---|---|---|
| errors | `IDbErrorFactory<TError>` | Required. `is` recognises an error of your family, `make` and `internal` build one. |
| table | `IConstraintTable` | Required. Which constraint means which code. The application owns it; the kit holds none. |
| logger | `Pick<IPoolLogger, 'error'>` | Required. Only `error` is called, so any `{ warn, error }` logger fits. |
| counter | `IDbErrorCounter` | Optional. Called with `db_constraint_unmapped_total` or `db_error_internal_total`. A counter typed over a wider list of names fits. Default: nowhere. |
| details | `Readonly<Record<string, unknown>>` | Optional. The details only the caller knows (the value of the duplicate, the ids that keep a row in use). Only the keys a row lists as `supplied` are copied; a key for a row that lists none is ignored. |
| internalCode | `string` | Optional. The code of a table row that means "this constraint is known, and a violation of it can only be a defect". Default `INTERNAL`, the code `errors.internal` is expected to build. |

```ts
import type { IConstraintEntryBuilder } from '@axiumine/koa-utils/lib/PostgreSQL/error/IConstraintEntryBuilder'
import type { IDbErrorFactory } from '@axiumine/koa-utils/lib/PostgreSQL/error/IDbErrorFactory'
import { buildConstraintEntry } from '@axiumine/koa-utils/lib/PostgreSQL/error/buildConstraintEntry'
import { mapDbError } from '@axiumine/koa-utils/lib/PostgreSQL/error/mapDbError'
import type { ITxPool } from '@axiumine/koa-utils/lib/PostgreSQL/tx/ITxPool'
import { withTx } from '@axiumine/koa-utils/lib/PostgreSQL/tx/withTx'

class AppError extends Error {
	constructor(
		readonly code: string,
		readonly details?: unknown
	) {
		super(code)
	}
}

const errors: IDbErrorFactory<AppError> = {
	is: (error): error is AppError => error instanceof AppError,
	make: (code, details) => new AppError(code, details),
	internal: (reason) => new AppError('INTERNAL', { reason })
}

const logger = {
	warn: (message: string, fields?: Readonly<Record<string, unknown>>) => console.warn(message, fields),
	error: (message: string, fields?: Readonly<Record<string, unknown>>) => console.error(message, fields)
}

type ICode = 'DUPLICATE_ITEM' | 'EMAIL_TAKEN' | 'INTERNAL'
interface IDetails {
	DUPLICATE_ITEM: { kind: 'sku' | 'slot'; value: string }
}
const constraintEntry: IConstraintEntryBuilder<ICode, IDetails> = buildConstraintEntry

// the table is data: the application writes it, next to its schema
const table = Object.freeze({
	items_order_id_sku_uq: constraintEntry('DUPLICATE_ITEM', { fixed: { kind: 'sku' }, supplied: ['value'] }),
	customers_email_uq: constraintEntry('EMAIL_TAKEN')
})

export async function addItem(pool: ITxPool, orderId: number, sku: string): Promise<void> {
	try {
		await withTx(pool, { logger, errors }, async (tx) => {
			await tx.query('INSERT INTO items (order_id, sku) VALUES ($1, $2)', [orderId, sku])
		})
	} catch (error) {
		// unique violation of items_order_id_sku_uq → AppError('DUPLICATE_ITEM', { kind: 'sku', value: sku })
		throw mapDbError(error, { errors, table, logger, details: { value: sku } })
	}
}
```

### `DB_INTERNAL_REASONS`, `IDbInternalReason`

**Import:**
```ts
import { DB_INTERNAL_REASONS } from '@axiumine/koa-utils/lib/PostgreSQL/error/DB_INTERNAL_REASONS'
import type { IDbInternalReason } from '@axiumine/koa-utils/lib/PostgreSQL/error/IDbInternalReason'
```

**Signature:**
```ts
export const DB_INTERNAL_REASONS: readonly [
	'CONSTRAINT_UNMAPPED', 'CONSTRAINT_INTERNAL', 'DETAILS_NOT_SUPPLIED', 'DB_ERROR', 'DB_VALUE_UNREADABLE',
	'DB_CONNECTION', 'DB_TX_MISUSE', 'UNEXPECTED_ERROR', 'VERSION_UNCHANGED', 'REREAD_UNREADABLE'
]
export type IDbInternalReason = (typeof DB_INTERNAL_REASONS)[number]
```

The closed reasons that `mapDbError` and `guardVersion` pass to `errors.internal(reason)`. They are for the log and the developer; format your responses so that the reason stays out of the body. The two reasons of `withTx` (`TX_FAILURE_REASONS`) are separate.

| Reason | Built when |
|---|---|
| `CONSTRAINT_UNMAPPED` | a violation (23505, 23514, 23503) names a constraint the table does not hold, or none |
| `CONSTRAINT_INTERNAL` | the table maps the constraint to the internal code (a violation that can only be a defect) |
| `DETAILS_NOT_SUPPLIED` | the row lists `supplied` keys and the call did not give all of them |
| `DB_ERROR` | any other SQLSTATE (a missing grant, a statement timeout, a server shutting down, ...) |
| `DB_VALUE_UNREADABLE`, `DB_CONNECTION`, `DB_TX_MISUSE` | a `DbParseError`, a `DbConnectError`, a `DbTxError` |
| `UNEXPECTED_ERROR` | anything else |
| `VERSION_UNCHANGED` | `guardVersion` re-read a visible row that still has the expected version |
| `REREAD_UNREADABLE` | the statement of `guardVersion` answered more than one row, or a row without a readable version |

### Constraint tables: `buildConstraintEntry`, `lookupConstraint`, `IConstraintEntryBuilder`

**Import:**
```ts
import { buildConstraintEntry } from '@axiumine/koa-utils/lib/PostgreSQL/error/buildConstraintEntry'
import { lookupConstraint } from '@axiumine/koa-utils/lib/PostgreSQL/error/lookupConstraint'
import type { IConstraintEntry } from '@axiumine/koa-utils/lib/PostgreSQL/error/IConstraintEntry'
import type { IConstraintEntryBuilder } from '@axiumine/koa-utils/lib/PostgreSQL/error/IConstraintEntryBuilder'
import type { IConstraintTable } from '@axiumine/koa-utils/lib/PostgreSQL/error/IConstraintTable'
```

**Signature:**
```ts
export interface IConstraintEntry<TCode extends string = string> {
	readonly code: TCode
	readonly fixed?: Readonly<Record<string, unknown>>
	readonly supplied?: readonly string[]
}
export type IConstraintTable<TCode extends string = string> = Readonly<Record<string, IConstraintEntry<TCode>>>
export function buildConstraintEntry<TCode extends string>(
	code: TCode,
	parts?: { readonly fixed?: object; readonly supplied?: readonly PropertyKey[] }
): IConstraintEntry<TCode>
export function lookupConstraint<TCode extends string>(table: IConstraintTable<TCode>, name: string): IConstraintEntry<TCode> | undefined
```

A constraint table maps the name of a constraint, as the driver reports it in the `constraint` field of the error, to one row. It is data, not logic: a service never writes `if (constraint === ...)`, it hands the failure to `mapDbError` and the table is the one place that says which constraint means which code. A row says:

- `code`: the code `errors.make` is called with. The internal code (see `internalCode`) means "known, and a defect": the name is logged and the response carries nothing of it.
- `fixed`: the details the constraint itself determines. They are written in the table, so the mapper never guesses them from the driver text.
- `supplied`: the keys of the details that only the caller knows. `mapDbError` copies these keys from its `details` option and no others, and never reads them from the message or the `detail` of the driver, which quote the failing row. When one is missing the result is `errors.internal('DETAILS_NOT_SUPPLIED')`, because an error without the details its code is typed with would break the contract of the code.

Put in the table only the constraints that follow unambiguously. One that is raised on more than one path with a different code on each, or whose code depends on the state of the row, stays out; a violation of it is then `CONSTRAINT_UNMAPPED` with the name logged.

`buildConstraintEntry` builds and freezes a row. It copies `fixed` and `supplied`, drops an empty `supplied` list, and checks nothing about the code or the details. `IConstraintEntryBuilder<TCode, TDetailsByCode>` is its typed view over your own closed list of codes and a map from each code that has documented details to their shape. Instantiate it once, as in the example above (`const constraintEntry: IConstraintEntryBuilder<ICode, IDetails> = buildConstraintEntry`); it is the same function at run time. The compiler then refuses, per row:

- a code with documented details called without `fixed` or `supplied` (the row must say where the details come from);
- a code without documented details called with a second argument;
- a key in `fixed` or `supplied` that the details of the code do not have, a value of the wrong type in `fixed`, and a key that is both fixed and supplied;
- a code that is not in your list.

`lookupConstraint` answers the row for a name, or `undefined`. Only own entries count, so a name such as `constructor` or `__proto__` (the server accepts any quoted identifier) finds nothing.

### Counters and types of the mapper

| Subpath | Export | Value or shape |
|---|---|---|
| `error/IDbErrorCounterName` | `IDbErrorCounterName` | `'db_constraint_unmapped_total' \| 'db_error_internal_total'` |
| `error/IDbErrorCounter` | `IDbErrorCounter` | `IDbCounter<IDbErrorCounterName>` |
| `error/IMapDbErrorOptions` | `IMapDbErrorOptions<TError>` | the options above |
| `error/IConstraintEntry` | `IConstraintEntry<TCode>` | one row |
| `error/IConstraintTable` | `IConstraintTable<TCode>` | `Readonly<Record<string, IConstraintEntry<TCode>>>`; a table over fewer codes fits where `IConstraintTable` is wanted |
| `error/IConstraintEntryBuilder` | `IConstraintEntryBuilder<TCode, TDetailsByCode>` | the typed call signatures of `buildConstraintEntry` |

## Write guards

### `assertAffected`

**Import:** `import { assertAffected } from '@axiumine/koa-utils/lib/PostgreSQL/guard/assertAffected'`

**Signature:**
```ts
export interface IAffectedResult {
	readonly rowCount: number | null
}
export function assertAffected(result: IAffectedResult, expected: number, onMismatch: Error | (() => Error)): void
```

Throws `onMismatch` unless the statement affected exactly `expected` rows, so an update that matched nothing is never reported as a success. `onMismatch` is the error, or a function that builds it (so a call that succeeds builds no error); it comes from you, built with your own error family, so `assertAffected` takes no factory. A count the server did not report (`null`, the answer of a statement that is not a `SELECT`, `INSERT`, `UPDATE` or `DELETE`) is not `expected`: nothing was proved. `expected` must be a whole number from 0, otherwise `TypeError('expected must be a whole number of rows from 0')` is thrown before the count is read. An `ITxResult` fits `IAffectedResult`.

### `guardVersion`

**Import:**
```ts
import { guardVersion } from '@axiumine/koa-utils/lib/PostgreSQL/guard/guardVersion'
import type { IVersionGuardInput } from '@axiumine/koa-utils/lib/PostgreSQL/guard/IVersionGuardInput'
```

**Signature:**
```ts
export function guardVersion<TError extends Error>(tx: Pick<ITx, 'query'>, input: IVersionGuardInput<TError>): Promise<TError>
```

Says why an update guarded by `WHERE id = $1 AND version = $2` (or `rev`) affected no row, and answers the error for the caller to throw. It does not throw it, so `throw await guardVersion(...)` ends the flow for the compiler too. It re-reads the row with the statement you give it, in the transaction of the failed update:

| Re-read | Answer |
|---|---|
| no row (absent, or the actor may not see it: the two are one answer on purpose, so a call by id never confirms that a row exists to someone who may not see it) | `errors.make('NOT_FOUND', { entity })` |
| a row with another version, `field` `version` | `errors.make('STALE_VERSION')` |
| a row with another version, `field` `rev` | `errors.make('STALE_REV')` |
| a row that still has the expected version | `errors.internal('VERSION_UNCHANGED')`: the update missed for a reason the guard cannot name |
| more than one row, or a row without a readable version column | `errors.internal('REREAD_UNREADABLE')` |

The version is read as a safe integer or as a string of 1 to 19 digits (the pool hands a `bigint` over as a decimal string); anything else is unreadable. The internal cases count `db_error_internal_total` and log `version guard cannot decide` with `reason`, `field` and `entity`. A failure of the re-read itself is thrown unchanged, for `mapDbError` or `withTx` to classify. The kit builds no SQL here: the statement runs as you gave it, a literal with parameters written by you, who own the table and the visibility rule; the values go to the server and nowhere else, and neither the text nor the values reach a log line or an error. `TypeError` for a `field`, an `expected` or an `entity` out of shape (checked in that order, before any statement).

**Input (`IVersionGuardInput<TError>`):**

| Name | Type | Description |
|---|---|---|
| reread | `{ text: string; values?: readonly unknown[] }` | The statement that reads the row again. It carries the actor's visibility predicate and the id, and answers no row when the row is absent or hidden, and one row with the column named by `field` otherwise. |
| expected | `number` | The version the failed update was guarded with: the one the client sent. A whole number. |
| field | `IVersionGuardField` | `'version'` (gives `STALE_VERSION`) or `'rev'` (gives `STALE_REV`). |
| entity | `string` | The kind of row, non-empty; the details of `NOT_FOUND`. |
| errors | `Pick<IDbErrorFactory<TError>, 'make' \| 'internal'>` | Builds every answer. The codes it is given for `make` are `IVersionGuardCode`: `'NOT_FOUND'`, `'STALE_VERSION'`, `'STALE_REV'`; map them to the codes of your own family there. |
| logger | `Pick<IPoolLogger, 'error'>` | Where the internal cases are logged. |
| counter | `IGuardCounter` | Optional. Called with `db_error_internal_total`. Default: nowhere. |

```ts
import type { IDbErrorFactory } from '@axiumine/koa-utils/lib/PostgreSQL/error/IDbErrorFactory'
import { assertAffected } from '@axiumine/koa-utils/lib/PostgreSQL/guard/assertAffected'
import { guardVersion } from '@axiumine/koa-utils/lib/PostgreSQL/guard/guardVersion'
import type { ITxPool } from '@axiumine/koa-utils/lib/PostgreSQL/tx/ITxPool'
import { withTx } from '@axiumine/koa-utils/lib/PostgreSQL/tx/withTx'

declare const errors: IDbErrorFactory
declare const logger: { warn(message: string): void; error(message: string): void }

export async function renameOrder(pool: ITxPool, id: number, version: number, name: string, actorId: number): Promise<void> {
	await withTx(pool, { logger, errors }, async (tx) => {
		const result = await tx.query('UPDATE orders SET name = $1, version = version + 1 WHERE id = $2 AND version = $3', [name, id, version])
		if (result.rowCount === 0) {
			throw await guardVersion(tx, {
				reread: { text: 'SELECT version FROM orders WHERE id = $1 AND owner_id = $2', values: [id, actorId] },
				expected: version,
				field: 'version',
				entity: 'order',
				errors,
				logger
			})
		}
	})
}

export async function deleteItem(pool: ITxPool, id: number): Promise<void> {
	await withTx(pool, { logger, errors }, async (tx) => {
		const result = await tx.query('DELETE FROM items WHERE id = $1', [id])
		assertAffected(result, 1, () => errors.make('NOT_FOUND', { entity: 'item' }))
	})
}
```

### Guard types

| Subpath | Export | Value or shape |
|---|---|---|
| `guard/VERSION_GUARD_FIELDS` | `VERSION_GUARD_FIELDS` | `['version', 'rev'] as const` |
| `guard/IVersionGuardField` | `IVersionGuardField` | one of `VERSION_GUARD_FIELDS` |
| `guard/IVersionGuardCode` | `IVersionGuardCode` | `'NOT_FOUND' \| 'STALE_VERSION' \| 'STALE_REV'`: the codes `guardVersion` passes to `errors.make` |
| `guard/IVersionGuardInput` | `IVersionGuardInput<TError>` | the input above |
| `guard/IGuardCounter` | `IGuardCounter` | `IDbCounter<'db_error_internal_total'>` |
| `guard/IAffectedResult` | `IAffectedResult` | `{ readonly rowCount: number \| null }` |

## Role assertion

### `assertRole`

**Import:**
```ts
import { assertRole } from '@axiumine/koa-utils/lib/PostgreSQL/role/assertRole'
import type { IAssertRoleOptions } from '@axiumine/koa-utils/lib/PostgreSQL/role/IAssertRoleOptions'
import type { IRoleGrant } from '@axiumine/koa-utils/lib/PostgreSQL/role/IRoleGrant'
import type { IRolePool } from '@axiumine/koa-utils/lib/PostgreSQL/role/IRolePool'
import type { IRoleAssertion } from '@axiumine/koa-utils/lib/PostgreSQL/role/IRoleAssertion'
```

**Signature:**
```ts
export interface IRoleGrant {
	readonly object: string
	readonly privilege: string
	readonly columns?: readonly string[]
}
export interface IAssertRoleOptions {
	readonly expectedRole: string
	readonly expectedGrants: readonly IRoleGrant[]
	readonly allowedMemberships?: readonly string[]
}
export interface IRolePool {
	connect(): Promise<ITxClient>
	end(): Promise<void>
}
export interface IRoleAssertion {
	readonly role: string
	readonly grantsChecked: number
}
export function assertRole(pool: IRolePool, options: IAssertRoleOptions): Promise<IRoleAssertion>
```

A boot check: a service proves, once, on one connection, that it runs as the role it believes it is, that the role cannot do what it must not, and that the grants it needs are there. A service wired by mistake to a more privileged login (a migration role, an administrator, a superuser) stops before it opens a listener. It is not a per-request check and nothing in it is meant for a request path. The pool is any object with `connect()` and `end()`; the `pg.Pool` that `createPool` returns has both. Nothing is imported from `pg`.

The checks run in this order, on one checked-out connection; the first failure ends the check and is the one reported:

| Step | Check | Reason on failure |
|---|---|---|
| 0 | the options are well formed; found before the pool is asked for a connection | `INVALID_EXPECTATION` |
| 1 | `current_user` is `expectedRole` | `ROLE_MISMATCH` |
| 2 | the role has none of the five attributes, tested in this order: superuser, CREATEROLE, CREATEDB, BYPASSRLS, REPLICATION (read from `pg_roles`) | `ROLE_SUPERUSER`, `ROLE_CREATEROLE`, `ROLE_CREATEDB`, `ROLE_BYPASSRLS`, `ROLE_REPLICATION` |
| 3 | the role owns nothing: `pg_shdepend`, the shared dependency catalog, has one owner row for every object of every database of the cluster that a role owns, so one read answers for tables, functions, schemas, types, databases and the rest | `ROLE_OWNS_OBJECTS` |
| 4 | the role is a member of no other role, directly or through a chain of roles, except those named in `allowedMemberships` (default none); `object` of the error is the first role, in code unit order, that is not allowed | `ROLE_MEMBERSHIP` |
| 5 | `session_user` is `current_user`: the connection did not log in as one role and then `SET ROLE` to another, which would make the login hold more than the role | `SESSION_ROLE_DIFFERS` |
| 6 | each entry of `expectedGrants` is held, in the order of the list, checked with the catalog privilege functions for `current_user`; `object`, `privilege` and for a column-level grant `column` name the first that is not | `GRANT_MISSING` |
| any | the check could not be made: no connection, a catalog query that failed, an answer that is not what the catalog gives (a missing list of rows, a flag that is not a boolean, a name that is not text); `code` is the closed reason of a `DbConnectError` or the driver's short code | `CHECK_FAILED` |

An answer is never read as a pass unless it is exactly what a pass looks like: a flag counts only if it is the boolean `false`, a grant only if the catalog answers one row whose `held` is the boolean `true`. An object that does not exist, a privilege the kind of object cannot hold (`USAGE` on a table, `DELETE` on a sequence), a `NULL` and a second row are all a missing grant.

**Grants (`IRoleGrant`):** the expected grants are a parameter; nothing about any role is built in.

| `object` | `privilege` | `columns` |
|---|---|---|
| a schema, `app` | `USAGE` or `CREATE` | not allowed |
| a table, a view or a sequence, `app.orders` | `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES` or `TRIGGER` (a table or view), `USAGE` (a sequence). On a sequence only `USAGE`, `SELECT` and `UPDATE` can be held; on a table or view `USAGE` is always reported missing | optional, see below |
| a function, `app.resolve_token`: every function of that name, arguments not given | `EXECUTE` | not allowed |

`columns` is for `SELECT`, `INSERT`, `UPDATE` or `REFERENCES` on a table: a non-empty list of column names, each checked with `has_column_privilege`, which a table-level grant also satisfies. Without `columns` the check is `has_table_privilege`, which a column-level grant does not satisfy. A column the table does not have is missing too.

Every name is a plain identifier (a letter or `_`, then letters, digits, `_` or `$`, at most 63 characters) and an object is a name or `schema.name` with those same parts; quoting, a third part, a space and a privilege in lower case are `INVALID_EXPECTATION`. A name or a privilege reaches the server only as a bound parameter, never in the text of a statement.

**Failure handling.** On any failure, `assertRole` closes the pool (`pool.end()`, whose own failure is ignored so the real one is reported) and then throws a [`RoleAssertionError`](#roleassertionerror-role_assert_reasons-iroleassertionreason-iroleassertionsubject). A connection that emitted an error or failed in the middle of a query is destroyed (`release(true)`); one that only failed an assertion goes back to the pool. On success the pool stays open and the answer is `{ role, grantsChecked }`. The error never carries the connection string: the function is given the pool, not the URL. A role name that is not a plain name prints as `?`.

```ts
import pg from 'pg'
import { createPool } from '@axiumine/koa-utils/lib/PostgreSQL/pool/createPool'
import { assertRole } from '@axiumine/koa-utils/lib/PostgreSQL/role/assertRole'
import type { IRoleGrant } from '@axiumine/koa-utils/lib/PostgreSQL/role/IRoleGrant'

const logger = { warn: console.warn, error: console.error }
const expectedGrants: IRoleGrant[] = [
	{ object: 'app', privilege: 'USAGE' },
	{ object: 'app.orders', privilege: 'SELECT' },
	{ object: 'app.items', privilege: 'UPDATE', columns: ['label', 'locale'] },
	{ object: 'app.resolve_token', privilege: 'EXECUTE' }
]

const pool = createPool({ driver: pg, url: process.env['DATABASE_URL'] ?? '', max: 10, applicationName: 'orders-api', logger })

// at boot, before the listener opens: throws RoleAssertionError, with the pool already closed, if the login is wrong
const { role, grantsChecked } = await assertRole(pool, { expectedRole: 'app_role', expectedGrants, allowedMemberships: ['reader_role'] })
logger.warn('database role verified', { role, grantsChecked })
```

**What the tests in this package prove, and what they do not.** The specs run `assertRole` against a fake pool whose client answers from a small model of the catalog. The fake recognises each statement by its exact text, held in the spec as a golden copy, and by the number of values it is sent, so any edit of a statement fails a spec until the copy is edited too. They prove the order of the checks, what each failure names, what is closed, and that nothing of the connection string or the driver reaches the error. They do **not** prove what the statements do on a real server, because no database runs in this repository: that the recursive membership walk finds a role reached through a chain, that `pg_shdepend` lists a table owner, or that `has_sequence_privilege` is what answers for a sequence is shown only by an integration test against a live PostgreSQL, which belongs to the consumer that depends on this check. If you rely on `assertRole` for a security decision, run such a test with your own roles.

### Role assertion types

| Subpath | Export | Value or shape |
|---|---|---|
| `role/IRoleGrant` | `IRoleGrant` | one expected privilege, above |
| `role/IAssertRoleOptions` | `IAssertRoleOptions` | the options above |
| `role/IRolePool` | `IRolePool` | `{ connect(): Promise<ITxClient>; end(): Promise<void> }` |
| `role/IRoleAssertion` | `IRoleAssertion` | `{ readonly role: string; readonly grantsChecked: number }` |
| `error/IRoleAssertionReason` | `IRoleAssertionReason` | one of `ROLE_ASSERT_REASONS` |
| `error/IRoleAssertionSubject` | `IRoleAssertionSubject` | `{ object?, privilege?, column?, code? }`, each `string \| undefined`, none ever a value from the driver |

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

## Clock and locks

Two pieces that meet inside one transaction. The **clock** reads the server time once per transaction, as epoch milliseconds, so that every comparison in one request uses one instant and no application host clock decides a deadline. The **lock tracker** keeps the order in which a transaction takes its locks, so that two requests can never wait for each other. They meet in `lockTaken`: a lock helper tells the clock that it has taken a lock, and a write transaction may read the time only after that.

### `createDbClock`

**Import:**
```ts
import { createDbClock } from '@axiumine/koa-utils/lib/PostgreSQL/clock/createDbClock'
import type { IDbClock } from '@axiumine/koa-utils/lib/PostgreSQL/clock/IDbClock'
import type { IDbClockOptions } from '@axiumine/koa-utils/lib/PostgreSQL/clock/IDbClockOptions'
import type { IDbClockSeam } from '@axiumine/koa-utils/lib/PostgreSQL/clock/IDbClockSeam'
import type { IClock } from '@axiumine/koa-utils/lib/PostgreSQL/clock/IClock'
```

**Signature:**
```ts
export interface IClock {
	now(): number
}
export interface IDbClock extends IClock {
	now(): number
	read(): Promise<number>
}
export interface IDbClockSeam {
	readonly statement: string
	readonly allowed: boolean
}
export interface IDbClockOptions {
	readonly write: boolean
	readonly seam?: IDbClockSeam | undefined
}
export function createDbClock(tx: ITx, options: IDbClockOptions): IDbClock
```

Makes the clock of one transaction. Call it once, where the transaction opens (inside [`withTx`](#withtx)), before or after the first lock helper. `IClock` is the plain port, `{ now(): number }`: pass the clock to any code that wants an instant, and a fake `{ now: () => 1700000000000 }` stands in for it in a test.

- `read()` is the asynchronous member. The first call runs one statement, [`CLOCK_SQL`](#clock_sql-db_now_sql), with no parameter; every later call answers the same number without a statement, and reads that start together share one statement. A read that failed is not retried: its failure is the answer of every later call.
- `now()` is the synchronous member and never touches the database. It answers the instant that was read. Before that it throws `DbClockError`: `NOT_READ` in a read-only transaction (await `read()` once first), `WRITE_BEFORE_LOCK` in a write transaction that has not taken a lock yet.
- `write` is required and has no default, so that the choice is made in the code that opens the transaction. A transaction flagged `write: true` must take a lock before it reads the time, so that the instant it stamps on its rows is later than the commit of every transaction that held the same lock before it. `now()` and `read()` before [`lockTaken`](#locktaken) has been called throw `DbClockError` `WRITE_BEFORE_LOCK`, a defect of the calling code. A read-only transaction has no such guard.
- The state of the transaction (whether a lock was taken, the instant) sits in a slot keyed by the handle that `withTx` hands out, so a retry that gets a fresh handle starts again. A second `createDbClock` for the same handle throws `ALREADY_BOUND`, also when the other clock was made by another copy of this package (see [Single copy of the package](#single-copy-of-the-package-and-shared-state)).

**The instant.** `extract(epoch FROM <timestamptz>)` does not depend on the session time zone, so the value is the same in UTC, in `America/Los_Angeles` and in `Asia/Tokyo`, and no value passes through a JavaScript `Date`. The server sends the `bigint` as text; the text goes through the `int8` rule of the kit (`parseInt8`: shape and 64-bit range), then through a safe-integer check, and only then becomes a number. `trunc` cuts toward zero; from 1970 on that is cutting the digits.

**The checks, in this order:** a `TypeError` (`write must be a boolean`) when `write` is not a boolean; then the seam (below); then `DbClockError` `ALREADY_BOUND`. Nothing is sent to the database before the first `read()`.

**The seam, for a test build.** `seam: { statement, allowed }` replaces `CLOCK_SQL` with a statement of yours. It must answer the same shape (one row, one `bigint` column named `ms`) and take no parameter; the typical use reads an override from a table that exists only in test databases, so a test can set the instant. The kit names no table and reads no environment variable: **you** compute `allowed` from your own environment, and it must be exactly `true`. The checks of the seam, in order: it is an object, `statement` is a non-empty string, `allowed` is a boolean (a `TypeError` each: `seam must be an object`, `seam.statement must be a non-empty string`, `seam.allowed must be a boolean`), and `allowed` is `true`; a seam that is not allowed throws `DbClockError` `SEAM_REFUSED` before anything touches the transaction. A missing flag is a `TypeError`, never an allowed seam.

```ts
import { createDbClock } from '@axiumine/koa-utils/lib/PostgreSQL/clock/createDbClock'
import { withTx } from '@axiumine/koa-utils/lib/PostgreSQL/tx/withTx'
import type { ITxOptions } from '@axiumine/koa-utils/lib/PostgreSQL/tx/ITxOptions'
import type { ITxPool } from '@axiumine/koa-utils/lib/PostgreSQL/tx/ITxPool'

declare const pool: ITxPool
declare const options: ITxOptions

// a read-only transaction: await read() once, then now() is ready
const stamp = await withTx(pool, options, async (tx) => {
	const clock = createDbClock(tx, { write: false })
	return await clock.read()
})

// a test build: the statement and the flag are yours
const testStatement = 'SELECT 1767323045678::bigint AS ms'
const frozen = await withTx(pool, options, async (tx) => {
	const clock = createDbClock(tx, { write: false, seam: { statement: testStatement, allowed: process.env['APP_ENV'] === 'ci' } })
	return await clock.read()
})
```

### `lockTaken`

**Import:** `import { lockTaken } from '@axiumine/koa-utils/lib/PostgreSQL/clock/lockTaken'`

**Signature:**
```ts
export function lockTaken(tx: ITx): Promise<void>
```

Called by a lock helper after the statement that took its lock. It records that the transaction holds a lock and, when a clock is bound to the handle and has not read yet, reads the instant right there: the instant of the request is then the first one taken after the first lock. When no clock is bound the read waits for the caller (`IDbClock.read`), which is allowed because the lock is already taken. A transaction without a clock pays nothing: no statement is added. It rejects with the failure of the read, which stays the answer of the clock. `lockedRow` and `lockedRows` call it for you.

### `CLOCK_SQL`, `DB_NOW_SQL`

| Subpath | Export | Value |
|---|---|---|
| `clock/CLOCK_SQL` | `CLOCK_SQL` | `'SELECT trunc(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS ms'` |
| `clock/DB_NOW_SQL` | `DB_NOW_SQL` | `'clock_timestamp()'` |

`clock_timestamp()` is the wall clock at the moment the statement runs, unlike `now()` and `transaction_timestamp()`, which stay at the start of the transaction. `trunc` cuts toward zero (a cast to `bigint` alone would round). `DB_NOW_SQL` is the same expression as a `timestamptz`, for a statement that decides inside the database, such as a lease that compares with the database time; it names no table.

### `DbClockError`, `DB_CLOCK_REASONS`, `IDbClockReason`

**Import:**
```ts
import { DbClockError } from '@axiumine/koa-utils/lib/PostgreSQL/error/DbClockError'
import { DB_CLOCK_REASONS } from '@axiumine/koa-utils/lib/PostgreSQL/error/DB_CLOCK_REASONS'
import type { IDbClockReason } from '@axiumine/koa-utils/lib/PostgreSQL/error/IDbClockReason'
```

**Signature:**
```ts
export const DB_CLOCK_REASONS = [
	'WRITE_BEFORE_LOCK', 'NOT_READ', 'ALREADY_BOUND', 'SEAM_REFUSED', 'BAD_RESULT', 'UNSAFE_INSTANT'
] as const
export type IDbClockReason = (typeof DB_CLOCK_REASONS)[number]
export class DbClockError extends Error {
	readonly reason: IDbClockReason
	constructor(reason: IDbClockReason)
}
```

The programming or configuration error of the clock. `name` is `'DbClockError'`; the message is fixed for each reason and holds no value; no `cause`.

| Reason | Message | Meaning |
|---|---|---|
| `WRITE_BEFORE_LOCK` | `the clock of a write transaction is read after the first lock helper has returned, not before` | `now()` or `read()` in a transaction flagged `write: true` before `lockTaken` |
| `NOT_READ` | `the instant of this transaction was not read yet: await clock.read() once before now()` | `now()` before the instant was read |
| `ALREADY_BOUND` | `this transaction already has a clock` | a second `createDbClock` for the same handle |
| `SEAM_REFUSED` | `the test seam of the clock is not allowed here` | a seam whose `allowed` is `false` |
| `BAD_RESULT` | `the clock statement did not answer one int8 value` | no row, more than one row, or a value that is not the text of an `int8` (a number, `null`, a missing column) |
| `UNSAFE_INSTANT` | `the database instant is not a safe integer number of milliseconds` | the value is a valid `int8` outside the safe-integer range of a JavaScript number |

A text that is not the shape of an `int8`, or is outside 64 bits, is a [`DbParseError`](#dbparseerror-db_parse_reasons-idbparsereason) from the `int8` parser (`MALFORMED`, `OUT_OF_RANGE`), not a `DbClockError`.

### `createLockOrderTracker`

**Import:**
```ts
import { createLockOrderTracker } from '@axiumine/koa-utils/lib/PostgreSQL/lock/createLockOrderTracker'
import type { ILockOrderSpec } from '@axiumine/koa-utils/lib/PostgreSQL/lock/ILockOrderSpec'
import type { ILockOrderTracker } from '@axiumine/koa-utils/lib/PostgreSQL/lock/ILockOrderTracker'
import type { ILockTrackerConfig } from '@axiumine/koa-utils/lib/PostgreSQL/lock/ILockTrackerConfig'
import type { ILockTrackerOptions } from '@axiumine/koa-utils/lib/PostgreSQL/lock/ILockTrackerOptions'
import type { ILockAdmission } from '@axiumine/koa-utils/lib/PostgreSQL/lock/ILockAdmission'
```

**Signature:**
```ts
export interface ILockOrderSpec<TMode extends string = string, THelper extends string = string> {
	readonly orders: Readonly<Record<TMode, readonly string[]>>
	readonly helpers: Readonly<Record<THelper, { readonly [TKey in TMode]?: string | undefined }>>
	readonly defaultMode: TMode
}
export interface ILockAdmission {
	readonly rank: number
}
export interface ILockTrackerConfig {
	readonly rankCheck?: boolean | undefined
}
export interface ILockTrackerOptions<TMode extends string = string> {
	readonly mode?: TMode | undefined
	readonly rankCheck?: boolean | undefined
}
export interface ILockOrderTracker<TMode extends string = string, THelper extends string = string> {
	configure(config?: ILockTrackerConfig): void
	track(tx: object, options?: ILockTrackerOptions<TMode>): void
	admit(tx: object, helper: THelper): ILockAdmission | undefined
	record(tx: object, admission: ILockAdmission | undefined): void
	hold(tx: object, key: string, strength: number): void
	held(tx: object, key: string): number
}
export function createLockOrderTracker<TMode extends string, THelper extends string>(
	spec: ILockOrderSpec<TMode, THelper>
): ILockOrderTracker<TMode, THelper>
```

Makes the tracker of the order of the locks in a transaction. The kit ships no order: the order is your **spec**, with the names you choose.

- `orders`: for each mode, the ranks lowest first, as distinct names. The rank of a name is its position, counted from 1. A transaction is in one mode; `defaultMode` is the mode of a transaction that was not given one.
- `helpers`: for each of your lock helpers, the rank it takes, by mode. A mode left out, or `undefined`, means the helper does not belong to that order. The same helper may belong to several orders.

The spec is checked once, when the tracker is made, and copied: changing the object afterwards changes nothing. A `TypeError` names the part that is wrong for a spec that would leave the order silently off: no mode, an order that is not a non-empty list of distinct names, a `defaultMode` that is not a mode, a helper that names a mode or a rank the spec lacks, a helper that takes no rank in any mode. TypeScript infers the mode and helper names from the spec, so `tracker.admit(tx, 'lockTypo')` and `tracker.track(tx, { mode: 'typo' })` do not compile.

**The state is the tracker's own.** It is a `WeakMap` that belongs to the tracker object (there is no module-level state), keyed by the handle that `withTx` hands out, so a retry (which gets a fresh handle) starts again and nothing is kept past the transaction. Make one tracker per spec, once, where your lock helpers live, and have every helper call it: two trackers do not see each other's transactions.

**The members.**

| Member | What it does |
|---|---|
| `admit(tx, helper)` | Checks the request against the order of the transaction's mode, **before the statement**, and answers the rank to record (`{ rank }`), or `undefined` when the helper has no rank in this mode and the check is off. Nothing is recorded yet. The same rank again passes; a lower rank than one already recorded throws `LockOrderError` `RANK_INVERSION`; a helper outside the mode throws `MODE_REQUIRED` (the transaction is in the default mode) or `NOT_IN_MODE_ORDER` (it is in another mode). With the check off none of them throws. A `TypeError` for a helper the spec does not name. |
| `record(tx, admission)` | Records the admitted rank once the lock was taken (the highest rank wins). `undefined` records nothing. A helper that takes its lock unconditionally records before its statement; a try-lock (`SKIP LOCKED`) records only when a row came back. |
| `track(tx, { mode, rankCheck })` | Puts the transaction in a mode and/or forces its rank check. Call it right after `withTx` opened the transaction and before the first lock; after a recorded lock it throws `LockOrderError` `TRACKER_STARTED`. A `TypeError` for a mode that is not in the spec (`mode must be one of ...`) and for a `rankCheck` that is not a boolean. With no options it puts the transaction back in the default mode with the default check. |
| `configure({ rankCheck })` | Sets the default of the rank check for every transaction that does not say otherwise. Default `true`. Call it once at start, with a value **you** computed: the tracker reads no environment variable. With nothing it restores `true`. It does not touch a transaction that is already tracked. |
| `hold(tx, key, strength)` | Records the strength of a lock of the transaction under a key you chose (`1` weakest): a stronger lock replaces a weaker one and a weaker one never replaces a stronger one. Recorded also when the rank check is off, because a later check of yours may read it. A `TypeError` for a strength that is not a whole number of at least 1. |
| `held(tx, key)` | The strength recorded under the key, `0` when none. A read: it creates no state. |

**Writing a lock helper.** The helper is yours: the statement, the table and the order live in your code. The parts above and below make it short.

```ts
import { createLockOrderTracker } from '@axiumine/koa-utils/lib/PostgreSQL/lock/createLockOrderTracker'
import { lockedRow } from '@axiumine/koa-utils/lib/PostgreSQL/lock/lockedRow'
import { rowLockModeOf } from '@axiumine/koa-utils/lib/PostgreSQL/lock/rowLockModeOf'
import { uuidOf } from '@axiumine/koa-utils/lib/PostgreSQL/lock/uuidOf'
import type { IRowLockMode } from '@axiumine/koa-utils/lib/PostgreSQL/lock/IRowLockMode'
import type { ITx } from '@axiumine/koa-utils/lib/PostgreSQL/tx/ITx'

const tracker = createLockOrderTracker({
	orders: { standard: ['account', 'order', 'invoice'], cleanup: ['order', 'invoice'] },
	helpers: {
		lockAccount: { standard: 'account' },
		lockOrder: { standard: 'order', cleanup: 'order' },
		lockInvoice: { standard: 'invoice', cleanup: 'invoice' }
	},
	defaultMode: 'standard'
})

interface IOrderRow {
	readonly id: string
	readonly status: string
}

const ORDER_FOR_UPDATE = 'SELECT id, status FROM shop.orders WHERE id = $1 FOR UPDATE'
const ORDER_FOR_SHARE = 'SELECT id, status FROM shop.orders WHERE id = $1 FOR SHARE'

export async function lockOrder(tx: ITx, orderId: string, mode: IRowLockMode): Promise<IOrderRow | undefined> {
	const id = uuidOf(orderId, 'orderId') // a TypeError that never quotes the value
	const statement = rowLockModeOf(mode) === 'update' ? ORDER_FOR_UPDATE : ORDER_FOR_SHARE
	tracker.record(tx, tracker.admit(tx, 'lockOrder')) // the order is checked before the statement
	const { rows } = await tx.query<IOrderRow>(statement, [id])
	return lockedRow(tx, rows[0]) // tells the clock a lock was taken, when a row came back
}

// a try-lock: the rank is checked first, recorded only when the row came back
export async function tryLockOrder(tx: ITx, orderId: string): Promise<IOrderRow | undefined> {
	const id = uuidOf(orderId, 'orderId')
	const admission = tracker.admit(tx, 'lockOrder')
	const { rows } = await tx.query<IOrderRow>('SELECT id, status FROM shop.orders WHERE id = $1 FOR UPDATE SKIP LOCKED', [id])
	const row = rows[0]
	if (row !== undefined) tracker.record(tx, admission)
	return lockedRow(tx, row)
}

// a transaction in the second mode, set before its first lock
export function startCleanup(tx: ITx): void {
	tracker.track(tx, { mode: 'cleanup' })
}
```

Turn the check off in production, if you want it to be a development tool only, with a value you computed: `tracker.configure({ rankCheck: process.env['APP_ENV'] !== 'production' })`. A transaction can still be forced either way with `track(tx, { rankCheck })`.

### `LockOrderError`, `LOCK_ORDER_REASONS`, `ILockOrderReason`

**Import:**
```ts
import { LockOrderError } from '@axiumine/koa-utils/lib/PostgreSQL/error/LockOrderError'
import { LOCK_ORDER_REASONS } from '@axiumine/koa-utils/lib/PostgreSQL/error/LOCK_ORDER_REASONS'
import type { ILockOrderReason } from '@axiumine/koa-utils/lib/PostgreSQL/error/ILockOrderReason'
```

**Signature:**
```ts
export const LOCK_ORDER_REASONS = ['RANK_INVERSION', 'MODE_REQUIRED', 'NOT_IN_MODE_ORDER', 'TRACKER_STARTED'] as const
export type ILockOrderReason = (typeof LOCK_ORDER_REASONS)[number]
export class LockOrderError extends Error {
	readonly reason: ILockOrderReason
	constructor(reason: ILockOrderReason, message: string)
}
```

The programming error of the tracker, all four reasons a defect of the calling code. `name` is `'LockOrderError'`. The message names the helper, the ranks and the mode and holds no id and no value; no `cause`.

| Reason | Message | Meaning |
|---|---|---|
| `RANK_INVERSION` | `lock order violated: lockOrder takes rank 2 (order) after rank 3 (invoice) in the standard order` | a lock of a lower rank was requested after one of a higher rank |
| `MODE_REQUIRED` | `<helper> belongs to the <mode> order: set that mode on the transaction before its first lock` | a helper that is not in the default order, in a transaction in the default mode (several modes read `a or b`) |
| `NOT_IN_MODE_ORDER` | `lockAccount is not one of the locks of the cleanup order (order, invoice)` | a helper that is not in the order of the mode the transaction is in |
| `TRACKER_STARTED` | `the lock order mode of a transaction is set before its first lock` | `track` after a lock was recorded in the transaction |

The reasons `MODE_REQUIRED` and `NOT_IN_MODE_ORDER` are the mode-generic form of a reason that names one particular second order; code that matched on such a reason matches on these two.

### `uuidOf`, `uuidsOf`, `rowLockModeOf`, `ROW_LOCK_MODES`

**Import:**
```ts
import { uuidOf } from '@axiumine/koa-utils/lib/PostgreSQL/lock/uuidOf'
import { uuidsOf } from '@axiumine/koa-utils/lib/PostgreSQL/lock/uuidsOf'
import { rowLockModeOf } from '@axiumine/koa-utils/lib/PostgreSQL/lock/rowLockModeOf'
import { ROW_LOCK_MODES } from '@axiumine/koa-utils/lib/PostgreSQL/lock/ROW_LOCK_MODES'
import type { IRowLockMode } from '@axiumine/koa-utils/lib/PostgreSQL/lock/IRowLockMode'
```

**Signature:**
```ts
export function uuidOf(value: unknown, label: string): string
export function uuidsOf(value: unknown, label: string): string[]
export const ROW_LOCK_MODES = ['update', 'share'] as const
export type IRowLockMode = (typeof ROW_LOCK_MODES)[number]
export function rowLockModeOf(value: unknown): IRowLockMode
```

Argument checks for lock helpers. They throw a `TypeError` that names the argument and never quotes the value.

- `uuidOf(value, label)` answers the id in lower case, or throws `` `${label} must be a UUID` `` for anything that is not the text form of a uuid (36 characters, hex digits and four dashes; no braces, no spaces, no missing dashes).
- `uuidsOf(value, label)` answers the ids in lower case, without duplicates, ascending (the order of the `uuid` type, so a statement that locks rows in that order and a helper that sorts agree). `` `${label} must be an array of UUIDs` `` for a value that is not an array, `` `each entry of ${label} must be a UUID` `` for a bad entry. An empty array gives an empty array.
- `rowLockModeOf(value)` answers `'update'` or `'share'`, or throws `mode must be one of update, share`. `ROW_LOCK_MODES` is the list. The kit does not turn a mode into a lock clause: your helper picks its statement from a fixed table by the mode.

### `lockedRow`, `lockedRows`

**Import:**
```ts
import { lockedRow } from '@axiumine/koa-utils/lib/PostgreSQL/lock/lockedRow'
import { lockedRows } from '@axiumine/koa-utils/lib/PostgreSQL/lock/lockedRows'
```

**Signature:**
```ts
export function lockedRow<TRow>(tx: ITx, row: TRow | undefined): Promise<TRow | undefined>
export function lockedRows<TRow>(tx: ITx, rows: TRow[]): Promise<TRow[]>
```

Tell the clock that a lock was taken, when the statement locked a row (`lockedRow`: the row is not `undefined`; `lockedRows`: the list is not empty), through [`lockTaken`](#locktaken), and answer what they were given. A statement that locked nothing is not a lock taken, so a write clock stays closed. Call them on the result of the lock statement, as in the helper above.

### `claimRowsSkipLocked`

**Import:**
```ts
import { claimRowsSkipLocked } from '@axiumine/koa-utils/lib/PostgreSQL/lock/claimRowsSkipLocked'
import { CLAIM_LIMIT_MAX } from '@axiumine/koa-utils/lib/PostgreSQL/lock/CLAIM_LIMIT_MAX'
import type { IClaimRegistry } from '@axiumine/koa-utils/lib/PostgreSQL/lock/IClaimRegistry'
import type { IClaimRequest } from '@axiumine/koa-utils/lib/PostgreSQL/lock/IClaimRequest'
```

**Signature:**
```ts
export const CLAIM_LIMIT_MAX = 1000
export type IClaimRegistry = Readonly<Record<string, Readonly<Record<string, string>>>>
export interface IClaimRequest {
	readonly table: string
	readonly predicate: string
	readonly limit: number
}
export function claimRowsSkipLocked<TRow>(tx: ITx, claims: IClaimRegistry, request: IClaimRequest): Promise<TRow[]>
```

The row-claim primitive for a queue of work: runs the statement that **your registry** holds for a table name and a predicate name, with the number of rows as `$1`, and tells the clock when it claimed any row. The statement is yours; it is expected to take its rows with `FOR UPDATE SKIP LOCKED`, oldest first, so that rows another transaction holds are skipped and never waited for, and several workers claim apart. The kit holds no statement: the registry is a constant in your code, and a name that is not an own key of it is refused, so a table or a predicate cannot come from input. A claim takes no rank in the order of a tracker (it is a queue operation, not a step of a request), and the caller commits the claim before it does anything slow with the rows.

The checks, in order, each a `TypeError` before any statement: the table (`table is not in the closed list of claim tables`), the predicate (`predicate is not in the closed list of <table>`), and the limit, a whole number from 1 to `CLAIM_LIMIT_MAX` (`limit must be a whole number from 1 to 1000`). Names such as `toString` or `__proto__` are not own keys and are refused.

```ts
import { claimRowsSkipLocked } from '@axiumine/koa-utils/lib/PostgreSQL/lock/claimRowsSkipLocked'
import type { IClaimRegistry } from '@axiumine/koa-utils/lib/PostgreSQL/lock/IClaimRegistry'
import type { ITx } from '@axiumine/koa-utils/lib/PostgreSQL/tx/ITx'

const CLAIMS = {
	jobs: {
		ready: 'SELECT id, kind FROM queue.jobs WHERE done_at IS NULL ORDER BY created_at, id LIMIT $1 FOR UPDATE SKIP LOCKED'
	}
} as const satisfies IClaimRegistry

interface IJobRow {
	readonly id: string
	readonly kind: string
}

export function claimJobs(tx: ITx, limit: number): Promise<IJobRow[]> {
	return claimRowsSkipLocked<IJobRow>(tx, CLAIMS, { table: 'jobs', predicate: 'ready', limit })
}
```

### What the kit does not export

The kit exports **no raw lock clause and no session-level lock**: no constant or function holds statement text with `FOR UPDATE`, `FOR SHARE`, `SKIP LOCKED`, an advisory lock or `LISTEN`, and nothing in the kit issues one. `ROW_LOCK_MODES` is a list of two words to validate against, and `claimRowsSkipLocked` runs a statement from your registry. Every lock clause of your service is therefore in your own helpers, so a grep or a lint rule over your source finds all of them; a check that scans only your tree is complete. The kit takes transaction-scoped locks only through your statements, and `withTx` sets nothing but `SET LOCAL`.

### Clock and lock types

| Subpath | Export | Value or shape |
|---|---|---|
| `clock/IClock` | `IClock` | `{ now(): number }` |
| `clock/IDbClock` | `IDbClock` | `IClock` plus `read(): Promise<number>` |
| `clock/IDbClockOptions` | `IDbClockOptions` | `{ write: boolean; seam?: IDbClockSeam \| undefined }` |
| `clock/IDbClockSeam` | `IDbClockSeam` | `{ statement: string; allowed: boolean }` |
| `error/IDbClockReason` | `IDbClockReason` | one of `DB_CLOCK_REASONS` |
| `lock/ILockOrderSpec` | `ILockOrderSpec<TMode, THelper>` | the spec above |
| `lock/ILockOrderTracker` | `ILockOrderTracker<TMode, THelper>` | the six members above |
| `lock/ILockTrackerConfig` | `ILockTrackerConfig` | `{ rankCheck?: boolean \| undefined }` |
| `lock/ILockTrackerOptions` | `ILockTrackerOptions<TMode>` | `{ mode?: TMode \| undefined; rankCheck?: boolean \| undefined }` |
| `lock/ILockAdmission` | `ILockAdmission` | `{ readonly rank: number }` |
| `lock/IRowLockMode` | `IRowLockMode` | one of `ROW_LOCK_MODES` |
| `lock/IClaimRegistry` | `IClaimRegistry` | table name to predicate name to statement |
| `lock/IClaimRequest` | `IClaimRequest` | `{ table: string; predicate: string; limit: number }` |
| `error/ILockOrderReason` | `ILockOrderReason` | one of `LOCK_ORDER_REASONS` |
| `error/IDbStateReason` | `IDbStateReason` | one of `DB_STATE_REASONS` |

## Single copy of the package and shared state

The errors are plain classes, so `error instanceof DbConnectError` is true only for errors made by the same installed copy of this package. If two copies end up in one dependency tree (two versions pinned by two of your dependencies), an error from one copy is not an `instanceof` of the other. Keep one version installed.

The clock is the one piece that would be split silently by a second copy: the slot of a transaction, where `lockTaken` records a lock and `createDbClock` binds its read, is state. In one copy it would be a module-level `WeakMap`; with two copies, a `lockTaken` from one would never reach a clock bound by the other, and a write clock would refuse to read for ever. The kit therefore defends in two ways, both on:

1. **The state is shared.** It lives in a frozen registry on `globalThis` under `Symbol.for('@axiumine/koa-utils/postgres-state')` (read-only, not enumerable), made by the first copy that loads and found by every later one. Two copies with the same registry layout share the slots, so `lockTaken` of one copy reaches the clock of the other and a second clock on one handle is `ALREADY_BOUND` whichever copy made the first. The registry holds a flag, an epoch number, a promise and a function per transaction handle; it holds no secret and no driver object.
2. **A copy that cannot share refuses to load.** The registry carries a layout number. A copy that finds a value under the key that is not its own layout (a copy of another layout, or other code) throws `DbStateError` `LAYOUT_MISMATCH` when its clock module is loaded, so the process stops at start and the state is never split silently. The layout changes only when the shape of the shared state changes in a way an older copy cannot read, and the release notes say so.

The lock tracker is not in the registry: its state belongs to the tracker object you made (a `WeakMap` in its closure), and the only code that reaches it is your helpers, through that object. A second copy of the package cannot split it. It does mean that two trackers, made from two specs or by two copies, are two independent sets of state.

Keep one version installed anyway: sharing the slots does not make two copies of the same code one, and the exact pin of the package in your services remains the rule.

### `DbStateError`, `DB_STATE_REASONS`, `IDbStateReason`

**Import:**
```ts
import { DbStateError } from '@axiumine/koa-utils/lib/PostgreSQL/error/DbStateError'
import { DB_STATE_REASONS } from '@axiumine/koa-utils/lib/PostgreSQL/error/DB_STATE_REASONS'
import type { IDbStateReason } from '@axiumine/koa-utils/lib/PostgreSQL/error/IDbStateReason'
```

**Signature:**
```ts
export const DB_STATE_REASONS = ['LAYOUT_MISMATCH'] as const
export type IDbStateReason = (typeof DB_STATE_REASONS)[number]
export class DbStateError extends Error {
	readonly reason: IDbStateReason
	constructor(reason: IDbStateReason)
}
```

`name` is `'DbStateError'` and `message` is `` `shared state of the PostgreSQL kit refused: ${reason}: keep one version of @axiumine/koa-utils installed` ``. It is thrown while a module of the clock is being loaded, not by a call, so it surfaces as the failure of an `import`.
