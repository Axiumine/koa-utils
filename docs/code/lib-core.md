# Lib — Auth, Tokens, Crypto, Validation

Core, dependency-light building blocks used across the auth flow (`signUp` → `login*` → `refresh` → `logout`) and by any resolver that touches user input. This covers opaque token generation with jittered access-token TTL, the Koa cookie option presets and the `setLoginCookies` helper, bcrypt password hashing, the email-verification hash, length validators for email/password, shared numeric constants, the `tryCatchRethrow` error normalizer used at the edge of every mutation, an enum-membership guard, a `sleepMs` delay helper, and a small onboarding-data projector. Most of these are single-purpose functions meant to be composed inside resolvers rather than used standalone.

## `generateAccessToken`

**Import:** `import { generateAccessToken } from '@axiumine/koa-utils/lib/tokens'`

**Signature:**
```ts
export function generateAccessToken(): string
```

Generates a new access token. Internally calls a private `generateToken()` helper that wraps `uuidv4()` from the `uuid` package — the token is an opaque random UUID v4 string, not a JWT. Call this on successful login to mint the token that is returned to the client as `{ accessToken }` in the response body and stored server-side in Redis under `${REDIS_KEY}access:<uuid>`.

**Returns:** `string` — a UUID v4 string.

## `generateRefreshToken`

**Import:** `import { generateRefreshToken } from '@axiumine/koa-utils/lib/tokens'`

**Signature:**
```ts
export function generateRefreshToken(): string
```

Generates a new refresh token using the same UUID v4 generator as `generateAccessToken`. Call this on successful login; the resulting value is stored in Redis under `${REDIS_KEY}refresh:<uuid>` and set as the signed `refresh_token` cookie via `setLoginCookies`.

**Returns:** `string` — a UUID v4 string.

## `accessTokenExpiry`

**Import:** `import { accessTokenExpiry } from '@axiumine/koa-utils/lib/tokens'`

**Signature:**
```ts
export function accessTokenExpiry(): number
```

Computes a jittered time-to-live for the access token, in **seconds**. `Math.random()` gives `[0,1)`, scaled by `61` and shifted by `30` minutes, then converted to seconds and floored — i.e. `Math.floor(((Math.random() * 61) + 30) * 60)`, which yields an integer number of seconds uniformly distributed across roughly 30–90 minutes (≈1800–5460 s). The jitter is recomputed on every call (not memoized) and is intended to make token expiry timing non-uniform across sessions. **Do not replace this jitter with a constant value** — it is intentional.

**Returns:** `number` — access-token TTL in seconds, ~1800 to ~5460.

## `REFRESH_TOKEN_EXPIRY`

**Import:** `import { REFRESH_TOKEN_EXPIRY } from '@axiumine/koa-utils/lib/tokens'`

**Signature:**
```ts
export const REFRESH_TOKEN_EXPIRY: number // = 90 * 24 * 60 * 60
```

Fixed refresh-token lifetime in **seconds** — 90 days (`7776000`). Unlike the access token, the refresh token TTL has no jitter. Used by `setLoginCookies` to compute the cookie's `maxAge` (`REFRESH_TOKEN_EXPIRY * 1000`, converting to milliseconds) and should be used consistently wherever the refresh Redis entry's TTL is set.

**Returns:** `number` — `7776000` (90 days in seconds).

## `accessTokenOptions`

**Import:** `import { accessTokenOptions } from '@axiumine/koa-utils/lib/tokenOptions'`

**Signature:**
```ts
export const accessTokenOptions: {
	httpOnly: boolean
	sameSite: string
	secure: boolean
	expirationDate: number
}
```

Cookie-options preset for an access-token cookie, built by spreading a private `baseOptions` object (`{ httpOnly: true, sameSite: 'Strict', secure: false, expirationDate: 0 }`) with no additional overrides. Not currently consumed elsewhere in this package (the access token is returned in the response body, not set as a cookie, in the shipped mutations) but is exported for consumers that do want to cookie-store the access token. Importing this module has the side effect of calling `dotenv.config()`.

**Notes:** `secure: false` is intentional — TLS is terminated at Nginx, which is expected to rewrite/enforce `secure` at the reverse-proxy layer. Do not change this in source.

## `refreshTokenOptions`

**Import:** `import { refreshTokenOptions } from '@axiumine/koa-utils/lib/tokenOptions'`

**Signature:**
```ts
export const refreshTokenOptions: {
	httpOnly: boolean
	sameSite: string
	secure: boolean
	expirationDate: number
}
```

Cookie-options preset for the `refresh_token` cookie, spread from the same private `baseOptions` as `accessTokenOptions` (`{ httpOnly: true, sameSite: 'Strict', secure: false, expirationDate: 0 }`). Used by `setLoginCookies` (merged with `maxAge`) and directly by the `logout` mutation to clear the cookie (`ctx.cookies.set('refresh_token', '', refreshTokenOptions)`). Importing this module has the side effect of calling `dotenv.config()`.

**Notes:** `secure: false` is intentional — TLS is terminated at Nginx, not in this cookie config. Do not change this in source.

## `setLoginCookies`

**Import:** `import { setLoginCookies } from '@axiumine/koa-utils/lib/setLoginCookies'`

**Signature:**
```ts
export function setLoginCookies(ctx: IContextLogin, refreshToken: string): void
```

Sets the `refresh_token` cookie on the Koa context after a successful login. Merges `refreshTokenOptions` with a computed `maxAge` of `REFRESH_TOKEN_EXPIRY * 1000` (Koa's cookie `maxAge` is in milliseconds, while `REFRESH_TOKEN_EXPIRY` is in seconds). Call this once per login/relogin, immediately after generating and persisting the new refresh token to Redis.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| ctx | `IContextLogin` | Koa-like context exposing `cookies: ICookies` (only `ctx.cookies` is used) |
| refreshToken | `string` | The newly generated refresh token to store in the cookie |

**Returns:** `void`.

**Notes:** Does not implement "remember me" cookie variants (see inline comment `// if remember me, generate ?`) — currently a single fixed 90-day `maxAge` regardless of caller intent.

## `ICookies`

**Import:** `import { ICookies } from '@axiumine/koa-utils/lib/ICookies'`

**Signature:**
```ts
export type ICookies = {
	set(key: 'access_token' | 'refresh_token', value: string, options: Options): void
	get(key: 'access_token' | 'refresh_token'): string | undefined
}
```
where the (unexported) `Options` shape is:
```ts
type Options = {
	httpOnly?: boolean
	sameSite?: string
	secure?: boolean
	path?: string
	expirationDate?: number
	maxAge?: number
}
```

Minimal structural type for a Koa-style `ctx.cookies` object, restricted to the two cookie keys this library manages (`access_token`, `refresh_token`). Used as the shape backing `IContextLogin.cookies` and consumed by `setLoginCookies`; implement/mock this interface in tests instead of depending on the full Koa `Context` type.

## `encryptPassword`

**Import:** `import { encryptPassword } from '@axiumine/koa-utils/lib/encryptPassword'`

**Signature:**
```ts
export async function encryptPassword(pwd: string): Promise<string>
```

Hashes a clear-text password with bcrypt (`@node-rs/bcrypt`) using a fixed cost factor of `SALT_ROUNDS = 14` (imported from the internal, non-exported `@private/lib/access/Constants.mjs`). Always use this function to hash a password before persisting it — never call `@node-rs/bcrypt` directly.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| pwd | `string` | Clear-text password to hash |

**Returns:** `Promise<string>` — the bcrypt hash string.

**Notes:** `SALT_ROUNDS = 14` is intentional; do not lower it for performance. `SALT_ROUNDS` itself is an internal constant and is not part of this package's public `exports`.

## `compareHashAsync`

**Import:** `import { compareHashAsync } from '@axiumine/koa-utils/lib/hash'`

**Signature:**
```ts
export async function compareHashAsync(clear: string, hash: string): Promise<boolean>
```

Verifies a clear-text password against a bcrypt hash (`@node-rs/bcrypt.compare`). Always use this to verify a password during login — never call `@node-rs/bcrypt` directly. Any error thrown by the underlying `bcrypt.compare` call is caught and immediately re-thrown unchanged.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| clear | `string` | Clear-text password supplied by the user (`pwd in chiaro`) |
| hash | `string` | Previously stored bcrypt hash (`hash della pwd`) |

**Returns:** `Promise<boolean>` — `true` if `clear` matches `hash`.

**Throws:** rethrows whatever `bcrypt.compare` throws (e.g. malformed hash) — not normalized to a GraphQL error by this function itself.

## `emailHash`

**Import:** `import { emailHash } from '@axiumine/koa-utils/lib/emailHash'`

**Signature:**
```ts
export function emailHash(): string
```

Generates a random verification-hash string of length `EMAIL_HASH_LEN` (50) using `StringLib.randomString`. Used by `signUp` (and email-change flows) to produce the `account.email.hash` value embedded in the verify-email link, later matched by `routerVerifyEmail`.

**Returns:** `string` — a random string of length 50.

## `checkEmailLen`

**Import:** `import { checkEmailLen } from '@axiumine/koa-utils/lib/checkEmailLen'`

**Signature:**
```ts
export function checkEmailLen(email: string): void
```

Validates an email's length before further processing. Throws (via `throwErrorWrongUserInput`) if the email is the empty string, or if it exceeds `EMAIL_MAX_LEN` (255) characters. Call this at the start of every resolver that accepts an email, after normalizing with `email.toLowerCase().trim()`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| email | `string` | Email address to validate (length only — no format/regex check) |

**Returns:** `void`.

**Throws:** `throwErrorWrongUserInput(...)` (422-class GraphQL error) — when `email === ''` ("L'email non può essere vuota") or `email.length > EMAIL_MAX_LEN` ("L'email non può superare i 255 caratteri").

## `checkPwdLen`

**Import:** `import { checkPwdLen } from '@axiumine/koa-utils/lib/checkPwdLen'`

**Signature:**
```ts
export function checkPwdLen(password: string): void
```

Validates a password's length before hashing/comparing. Throws if shorter than `MIN_PWD_LENGTH` (10) or longer than `MAX_PWD_LENGTH` (72 — the OWASP-documented bcrypt input limit). Call this at the start of every resolver that accepts a password.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| password | `string` | Clear-text password to validate |

**Returns:** `void`.

**Throws:** `throwErrorWrongUserInput(...)` (422-class GraphQL error) — when `password.length < 10` ("La password è troppo corta") or `password.length > 72` ("La password è troppo lunga").

## `OBJECTID_0_STR`

**Import:** `import { OBJECTID_0_STR } from '@axiumine/koa-utils/lib/Constants'`

**Signature:**
```ts
export const OBJECTID_0_STR = '000000000000000000000000'
```

The canonical all-zero MongoDB ObjectId, as a 24-character hex string. Useful as a sentinel/placeholder id (e.g. "no owner", "system user") distinct from `null`/`undefined`.

**Returns:** `string` — `'000000000000000000000000'`.

## `OBJECTID_0_OBJ`

**Import:** `import { OBJECTID_0_OBJ } from '@axiumine/koa-utils/lib/Constants'`

**Signature:**
```ts
export const OBJECTID_0_OBJ = new Types.ObjectId(OBJECTID_0_STR)
```

The same all-zero sentinel id as `OBJECTID_0_STR`, pre-constructed as a Mongoose `Types.ObjectId` instance for direct use in queries/documents without re-parsing the string on every use.

**Returns:** `Types.ObjectId` — instance wrapping `OBJECTID_0_STR`.

## `EMAIL_MAX_LEN`

**Import:** `import { EMAIL_MAX_LEN } from '@axiumine/koa-utils/lib/Constants'`

**Signature:**
```ts
export const EMAIL_MAX_LEN = 255
```

Maximum accepted email length in characters, enforced by `checkEmailLen`.

**Returns:** `number` — `255`.

## `MIN_PWD_LENGTH`

**Import:** `import { MIN_PWD_LENGTH } from '@axiumine/koa-utils/lib/Constants'`

**Signature:**
```ts
export const MIN_PWD_LENGTH = 10
```

Minimum accepted password length in characters, enforced by `checkPwdLen`.

**Returns:** `number` — `10`.

## `MAX_PWD_LENGTH`

**Import:** `import { MAX_PWD_LENGTH } from '@axiumine/koa-utils/lib/Constants'`

**Signature:**
```ts
export const MAX_PWD_LENGTH = 72
```

Maximum accepted password length in characters, enforced by `checkPwdLen`. Set to 72 per the [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#input-limits-of-bcrypt) input limit for bcrypt.

**Returns:** `number` — `72`.

## `EMAIL_HASH_LEN`

**Import:** `import { EMAIL_HASH_LEN } from '@axiumine/koa-utils/lib/Constants'`

**Signature:**
```ts
export const EMAIL_HASH_LEN = 50
```

Length, in characters, of the random verification hash generated by `emailHash`.

**Returns:** `number` — `50`.

## `tryCatchRethrow`

**Import:** `import { tryCatchRethrow } from '@axiumine/koa-utils/lib/tryCatchRethrow'`

**Signature:**
```ts
export function tryCatchRethrow(e: GraphQLError | Error): never
```

The standard error-normalizer called from the `catch` block of every mutation's transaction. First delegates to `throwIfMongoErr(e)`, which inspects `e` for Mongo-specific shapes and — if matched — throws the mapped GraphQL error itself (e.g. `DuplicateKeyError` → 409, messages prefixed `[Validator]` → 422) without returning. If `throwIfMongoErr` does not throw (i.e. `e` isn't a recognized Mongo error):
- if `e instanceof GraphQLError`, re-throws it via `throwGraphQLError(status, e.message, desc)`, reading `status` from `e.extensions?.http?.status` (default `500`) and `desc` from `e.extensions?.description` (default `''`);
- otherwise, reports `e` to Sentry via `Sentry.captureException(e)` and throws a generic `throwInternalError()` (500).

Do not add manual Mongo-error branching around this call — let `tryCatchRethrow` → `throwIfMongoErr` handle that mapping.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| e | `GraphQLError \| Error` | The error caught in the resolver's `catch` block |

**Returns:** never returns normally — always throws.

**Throws:** always throws: a mapped Mongo error (via `throwIfMongoErr`), a re-thrown `GraphQLError` (via `throwGraphQLError`), or a generic `throwInternalError()` for anything else.

**Notes:** Non-`GraphQLError`/non-Mongo errors are sent to Sentry (`Sentry.captureException`) before the generic 500 is thrown — so unexpected exceptions are still observable even though the client only sees a generic message.

## `throwIfNotValidEnumValue`

**Import:** `import { throwIfNotValidEnumValue } from '@axiumine/koa-utils/lib/throwIfNotValidEnumValue'`

**Signature:**
```ts
export function throwIfNotValidEnumValue<T extends Record<string, string | number>>(
	enumObj: T,
	value: string | number | boolean
): void
```

Guards a resolver input against an enum object, throwing a "wrong user input" GraphQL error if `value` is not one of `enumObj`'s member values. Checks membership with `Object.values(enumObj).includes(value)`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| enumObj | `T extends Record<string, string \| number>` | The TypeScript enum (or enum-shaped object) to validate against |
| value | `string \| number \| boolean` | The candidate value supplied by the caller |

**Returns:** `void`.

**Throws:** `throwErrorWrongUserInput('Wrong enum value')` (422-class GraphQL error) — when `value` is not found among `Object.values(enumObj)`.

## `sleepMs`

**Import:** `import { sleepMs } from '@axiumine/koa-utils/lib/sleepMs'`

**Signature:**
```ts
export const sleepMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
```

A promise-based delay helper — `await sleepMs(ms)` pauses execution for `ms` milliseconds. Useful for throttling, backoff, or deliberate delay in tests/handlers.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| ms | `number` | Milliseconds to wait |

**Returns:** `Promise<unknown>` — resolves (with `undefined`) after `ms` milliseconds.

## `makeOnboardingData`

**Import:** `import { makeOnboardingData } from '@axiumine/koa-utils/lib/makeOnboardingData'`

**Signature:**
```ts
export function makeOnboardingData(data: IOnboarding): string | null
```

Projects an `IOnboarding` document (`{ onboardingStep?: string; onboardingDone?: boolean }`) down to a single string for API responses: if `onboardingDone` is falsy, returns `null` (onboarding not finished / not applicable); if truthy, returns `onboardingStep ?? ''` (the last recorded step, or an empty string if none was recorded).

**Parameters:**

| Name | Type | Description |
|---|---|---|
| data | `IOnboarding` | Object with optional `onboardingStep: string` and `onboardingDone: boolean` |

**Returns:** `string \| null` — `null` when `data.onboardingDone` is falsy; otherwise `data.onboardingStep ?? ''`.

## `IAuthorizationDisDel`

**Import:** `import { IAuthorizationDisDel } from '@axiumine/koa-utils/lib/IAuthorizationDisDel'`

**Signature:**
```ts
export interface IAuthorizationDisDel {
	disabled?: boolean
	deleted?: Date
}
```

Shared shape for the disable/delete flags found on user (and similar) documents. `disabled` marks an account as administratively blocked; `deleted` holds the soft-delete timestamp (presence of a `Date` implies deleted). Intended to be spread/extended into larger Mongoose-backed document interfaces rather than used standalone.

**Notes:** This is the document-level counterpart to the Redis string flags described elsewhere (`redData?.disabled` / `redData?.deleted` read from Redis are strings, `'true'`/`'false'`, both truthy — different representation from this interface's native `boolean`/`Date` types). Don't conflate the two when reasoning about "falsy" checks.
