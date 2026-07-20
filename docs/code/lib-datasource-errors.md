# Lib — DB Error Mapping & Redis Booleans

This section covers the low-level, per-engine error shapes and mapping helpers that GraphQL mutations use to translate driver-level failures (MariaDB/Sequelize, MongoDB/Mongoose, PostgreSQL/`pg`) into the package's standard `GraphQLError` responses, plus the small Redis boolean codec used because Redis stores everything as strings. The MongoDB and MariaDB helpers actually `throw` mapped `GraphQLError`s (via `@throw/*`); the PostgreSQL helpers only type and format errors for logging — there is no `throwPostgresErrors` equivalent in this package. Mutations are expected to catch the raw driver error and pass it through the matching `throwXxx` helper (or `tryCatchRethrow`, documented elsewhere) rather than branching on error codes themselves.

## `IMariaDbErr`

**Import:** `import { IMariaDbErr } from '@axiumine/koa-utils/lib/MariaDB/IMariaDBErr'`

**Signature:**
```ts
export interface IMariaDbErr {
	parent?: {
		sqlMessage?: string
		code: string
	}
}
```

Shape of a MariaDB/Sequelize driver error as seen by `throwSqlErrors`. The actual SQL error info (message + error code) lives under `.parent`, matching how `sequelize`/`sequelize-typescript` wrap the underlying `mariadb` driver error.

**Notes:** The exported symbol is `IMariaDbErr` (lowercase `b`), while the package.json export key and filename are `IMariaDBErr` (uppercase `DB`) — match the casing shown above exactly when importing.

## `MariaDBErrType`

**Import:** `import { MariaDBErrType } from '@axiumine/koa-utils/lib/MariaDB/MariaDBErrType'`

**Signature:**
```ts
// https://mariadb.com/kb/en/mariadb-error-code-reference/
export enum MariaDBErrType {
	ER_DATA_TOO_LONG = 'ER_DATA_TOO_LONG'
}
```

Enum of MariaDB error codes this package currently recognizes. Only `ER_DATA_TOO_LONG` (value truncated/too long for a column) is mapped today; see the MariaDB error code reference linked in the source comment for the full code list if more need adding.

## `throwSqlErrors`

**Import:** `import { throwSqlErrors } from '@axiumine/koa-utils/lib/MariaDB/throwSqlErrors'`

**Signature:**
```ts
export function throwSqlErrors(e: IMariaDbErr)
```

Maps a MariaDB driver error to a `GraphQLError`. If `e.parent.code === MariaDBErrType.ER_DATA_TOO_LONG` and `e.parent.sqlMessage` is present, it parses the column name out of the SQL message (strips the literal `' column'` suffix, then extracts the text between the first two single quotes) and throws `throwErrorWrongUserInput(errorMessage)` — a 400 Bad Request carrying the offending column/value description. For every other error shape it throws `throwInternalError()` (500 Internal Server Error) — the source has a `// @todo report to Sentry` comment on this fallback branch, so unrecognized MariaDB errors are not currently reported to Sentry from here.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| e | IMariaDbErr | The caught MariaDB/Sequelize error, expected to carry `.parent.code` / `.parent.sqlMessage` |

**Returns:** never returns normally — every code path throws.

**Throws:**
- `400 Bad Request` (via `throwErrorWrongUserInput`) — when `e.parent.code === MariaDBErrType.ER_DATA_TOO_LONG` and `e.parent.sqlMessage` is set.
- `500 Internal Server Error` (via `throwInternalError`) — for any other error shape (not yet reported to Sentry, per the `@todo`).

## `IMongoDBError`

**Import:** `import { IMongoDBError } from '@axiumine/koa-utils/lib/MongoDB/IMongoDBError'`

**Signature:**
```ts
export interface IMongoDBError {
	errorResponse?: {
		code: MongoDBErrType
	}
	parent?: {
		errorResponse?: {
			code: MongoDBErrType
		}
	}
	message: string
}
```

Shape of a MongoDB/Mongoose driver error. The error code can appear either directly on `errorResponse.code` (raw MongoDB driver error) or nested under `parent.errorResponse.code` (Mongoose-wrapped error) — `throwIfMongoErr` checks both locations. `message` is always required and is used to detect Mongoose validator errors via the `[Validator]` prefix convention.

## `MongoDBErrType`

**Import:** `import { MongoDBErrType } from '@axiumine/koa-utils/lib/MongoDB/MongoDBErrType'`

**Signature:**
```ts
export enum MongoDBErrType {
	DuplicateKeyError = 11000
}
```

Enum of MongoDB server error codes. `11000` is the standard MongoDB duplicate-key error code (unique index violation).

## `throwIfMongoErr`

**Import:** `import { throwIfMongoErr } from '@axiumine/koa-utils/lib/MongoDB/throwIfMongoErr'`

**Signature:**
```ts
export function throwIfMongoErr(e: IMongoDBError)
```

Inspects a MongoDB error and throws a mapped `GraphQLError` for the two recognized cases; otherwise it returns normally (`undefined`) without throwing, letting the caller decide what to do next (see `throwMongoDBErrors` below, which falls back to a generic 500 in that case).

- If `e.errorResponse.code === MongoDBErrType.DuplicateKeyError` **or** `e.parent.errorResponse.code === MongoDBErrType.DuplicateKeyError`, it throws `throwConflictError()` → **409 Conflict** (via `throwAlreadyTakenError`).
- Else if `e.message.startsWith('[Validator]')`, it throws `throwErrorWrongUserInput(e.message.replace('[Validator]', '').trim())` → **400 Bad Request**, with the `[Validator]` prefix stripped from the message.
- Else: returns without throwing.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| e | IMongoDBError | The caught MongoDB/Mongoose error |

**Returns:** `void` — only when the error matches neither recognized case (no throw).

**Throws:**
- `409 Conflict` (via `throwConflictError` → `throwAlreadyTakenError`) — on `DuplicateKeyError` (code `11000`), checked at both `e.errorResponse.code` and `e.parent.errorResponse.code`.
- `400 Bad Request` (via `throwErrorWrongUserInput`) — when `e.message` starts with the literal string `[Validator]` (Mongoose schema validation failure); the prefix is stripped and the remaining text trimmed before being used as the error description.

**Notes:** `[Validator]`-prefixed errors map to **400 Bad Request**, not 422 — `throwErrorWrongUserInput` always throws status 400. Docs previously described this as a 409/422 split, which never matched the source; the split is 409 for `DuplicateKeyError` and 400 for `[Validator]`. Do not "fix" the code to match the old wording without coordinating with the owner; document behavior as implemented.

## `throwMongoDBErrors`

**Import:** `import { throwMongoDBErrors } from '@axiumine/koa-utils/lib/MongoDB/throwMongoErrors'`

**Signature:**
```ts
export const throwMongoDBErrors = (e: IMongoDBError): never => {
	throwIfMongoErr(e)
	// else throw here

	Sentry.captureException(e)
	throw throwInternalError()
}
```

Top-level MongoDB error handler for mutation `catch` blocks. First delegates to `throwIfMongoErr(e)`, which throws for `DuplicateKeyError` (409) and `[Validator]`-prefixed messages (400). If `throwIfMongoErr` returns normally (unrecognized error), this function reports the error to Sentry via `Sentry.captureException(e)` and then throws `throwInternalError()` — **500 Internal Server Error**. The `-> never` return type reflects that this function always throws.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| e | IMongoDBError | The caught MongoDB/Mongoose error |

**Returns:** `never` — always throws.

**Throws:**
- `409 Conflict` / `400 Bad Request` — re-thrown from `throwIfMongoErr` for the recognized cases (see above).
- `500 Internal Server Error` (via `throwInternalError`) — for any other error, after reporting it to Sentry (`@sentry/node`, a peer dependency).

**Notes:** The exported symbol name is `throwMongoDBErrors`, which differs from both the source filename (`throwMongoErrors.mts`) and the package.json export key (`./lib/MongoDB/throwMongoErrors`) — import the subpath as written but name the binding `throwMongoDBErrors` to match what the module actually exports.

## `IOnboarding`

**Import:** `import { IOnboarding } from '@axiumine/koa-utils/lib/MongoDB/IOnboarding'`

**Signature:**
```ts
export interface IOnboarding {
	onboardingStep?: string
	onboardingDone?: boolean
}
```

Shared shape for a MongoDB user document's onboarding progress fields — an optional `onboardingStep` label and an optional `onboardingDone` flag. Intended to be spread/embedded into larger user-document interfaces (e.g. via `makeOnboardingData`) rather than used standalone.

## `IPostgresError`

**Import:** `import { IPostgresError } from '@axiumine/koa-utils/lib/PostgreSQL/IPostgresError'`

**Signature:**
```ts
export interface IPostgresError extends Error {
	code?: string
	detail?: string
	constraint?: string
	hint?: string
}
```

Shape of a `pg`/PostgreSQL driver error, extending the native `Error` with the extra fields the `pg` driver attaches: `code` (the SQLSTATE error code, see `IPostgresErrorCodes`), `detail`, `constraint` (the violated constraint name), and `hint`.

## `IPostgresErrorCodes`

**Import:** `import { IPostgresErrorCodes } from '@axiumine/koa-utils/lib/PostgreSQL/IPostgresErrorCodes'`

**Signature:**
```ts
export enum IPostgresErrorCodes {
	duplicateKeyValue = '23505'
}
```

Enum of PostgreSQL SQLSTATE error codes. `23505` is the standard Postgres `unique_violation` code (duplicate key value violates unique constraint). Note there is no `throwPostgresErrors`-style mapping function in this package (unlike MariaDB/MongoDB) — callers are expected to compare `IPostgresError.code` against this enum themselves and throw the appropriate `@throw/*` helper (e.g. `throwConflictError` for `duplicateKeyValue`).

## `makePostgreSqlLogError`

**Import:** `import { makePostgreSqlLogError } from '@axiumine/koa-utils/lib/PostgreSQL/makePostgreSqlLogError'`

**Signature:**
```ts
export function makePostgreSqlLogError(pgError: IPostgresError): string
```

Formats a Postgres error into a single pipe-delimited log line: `` `${pgError.code} | ${pgError.hint} | ${pgError.detail} | ${pgError.constraint}` ``. Purely a string formatter for logging/Sentry breadcrumbs — it does not throw or otherwise map the error to a `GraphQLError`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| pgError | IPostgresError | The caught PostgreSQL/`pg` driver error |

**Returns:** `string` — `"<code> | <hint> | <detail> | <constraint>"`, with any missing field rendered as the literal `undefined`.

## `RedisBoolean`

**Import:** `import { RedisBoolean } from '@axiumine/koa-utils/lib/Redis/RedisBoolean'`

**Signature:**
```ts
export enum RedisBoolean {
	true = '1',
	false = '0'
}
```

String-valued enum representing a boolean as stored in Redis. Redis has no native boolean type — every value is a string — so this package standardizes on `'1'` / `'0'` rather than the literal strings `'true'`/`'false'` for boolean-flag fields. Used together with `toRedisBooleanValue` / `fromRedisBooleanValue` to convert at the Redis read/write boundary.

**Notes:** This is distinct from the `redData?.disabled` / `redData?.deleted` pattern documented elsewhere in the codebase, where the stored values are the literal strings `'true'`/`'false'` (both of which are truthy as strings) — `RedisBoolean` is a separate, `'1'`/`'0'` convention used where this enum is explicitly adopted. Do not mix the two conventions for the same field.

## `toRedisBooleanValue`

**Import:** `import { toRedisBooleanValue } from '@axiumine/koa-utils/lib/Redis/toRedisBooleanValue'`

**Signature:**
```ts
export function toRedisBooleanValue(value: boolean)
```

Converts a native JS `boolean` into its `RedisBoolean` string representation for writing to Redis: `true` → `RedisBoolean.true` (`'1'`), `false` → `RedisBoolean.false` (`'0'`).

**Parameters:**

| Name | Type | Description |
|---|---|---|
| value | boolean | The boolean value to encode for Redis storage |

**Returns:** `RedisBoolean.true \| RedisBoolean.false` (inferred) — `'1'` if `value` is `true`, otherwise `'0'`.

## `fromRedisBooleanValue`

**Import:** `import { fromRedisBooleanValue } from '@axiumine/koa-utils/lib/Redis/fromRedisBooleanValue'`

**Signature:**
```ts
export function fromRedisBooleanValue(data: RedisBoolean)
```

Converts a `RedisBoolean` string value read back from Redis into a native JS `boolean`. Implemented as a strict equality check against `RedisBoolean.true`, so any value other than `RedisBoolean.true` (`'1'`) — including `RedisBoolean.false` (`'0'`) or any unexpected string — decodes to `false`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| data | RedisBoolean | The raw value read from Redis (expected to be `'1'` or `'0'`) |

**Returns:** `boolean` (inferred) — `true` only when `data === RedisBoolean.true`; `false` for everything else.
