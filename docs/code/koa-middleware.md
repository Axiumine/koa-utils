# Koa — Auth Middleware & Router

This section covers the Koa-level authentication surface: the two Redis-backed session guards (`authenticatedResourceHandler` for general API resources, `authenticatedAuthorizationHandler` for the refresh endpoint), the shared cookie-signature verifier they build on (`verifySignedRefreshToken` / `TCookieRefreshToken`), the logout middleware (`authenticatedLogoutHandler`), a diagnostic pass-through (`debugHandler`), and the email-verification route handler (`routerVerifyEmail`). All middleware here are curried factories — call them once (optionally with args) to get back the actual `(ctx, next) => Promise<...>` Koa middleware. Each reads its credential from a header or cookie, looks the session up in Redis under `${process.env.REDIS_KEY}` + key, and either populates `ctx.state.user` or throws a `GraphQLError` with an HTTP status via `throwGraphQLError`.

## `authenticatedResourceHandler`

**Import:** `import { authenticatedResourceHandler } from '@axiumine/koa-utils/koa/middleware/authenticatedResourceHandler'`

**Signature:**
```ts
export const authenticatedResourceHandler: () => (ctx: IContextAuthenticatedResource, next: Next) => Promise<void>
```

General-purpose resource guard. Reads `ctx.request.header.authorization`, expects the literal prefix `Bearer access:`. Strips `Bearer ` (keeping the `access:` prefix) to get the key, then validates that the UUID portion (`key.slice('access:'.length)`) is a well-formed v4 UUID via `isValidUuidV4` — if not, throws `throwMissingMalformedInvalidToken()` before ever building the Redis key or calling `redisClient.hGetAll`. Otherwise builds the Redis key `${process.env.REDIS_KEY}access:<uuid>` and reads it with `redisClient.hGetAll`. If the hash exists, the raw Redis object is shallow-copied (`{ ...redSession }`, since node-redis hashes come back without `Object.prototype` in their chain) and checked for `redData?.disabled` / `redData?.deleted` — both are truthy for the *strings* `'true'`/`'false'` alike, so storage code must only ever set them when actually blocking. If clear, `ctx.state.user` is set to `{ ...redData, id: new Types.ObjectId(redData.id) }` (all other hash fields pass through as strings). If the hash is empty (expired/deleted token), the handler still allows the request through when `ctx.request.header['x-introspectioncode']` matches `process.env.INTROSPECTION_CODE` (internal service-to-service bypass) — otherwise it throws. Ends by calling `next()`.

**Returns:** `(ctx, next) => Promise<void>` — the Koa middleware; resolves via `next()` when authorized (or introspection-bypassed).

**Throws:**
- `412 Precondition Failed` (`throwPreconditionFailedNoAuthHeader`) — `authorization` header absent.
- `499 Token Required` (`throwAccessTokenRequired`) — header present but doesn't start with `Bearer access:`.
- `499 Token Required` (`throwMissingMalformedInvalidToken`) — prefix present but the UUID portion of the key is not a well-formed v4 UUID.
- `403 Forbidden` (`throwForbiddenError`) — Redis session found but `disabled`/`deleted` is set.
- `498 Invalid Token` (`throwAccessTokenExpiredOrDeleted`) — no Redis session for the key and no valid `x-introspectioncode`.

**Notes:** reads env `REDIS_KEY`, `INTROSPECTION_CODE`. Populates `ctx.state.user.id` as a Mongoose `ObjectId`, not a string. Loads `dotenv` at module scope.

## `authenticatedAuthorizationHandler`

**Import:** `import { authenticatedAuthorizationHandler } from '@axiumine/koa-utils/koa/middleware/authenticatedAuthorizationHandler'`

**Signature:**
```ts
export const authenticatedAuthorizationHandler: (keys: Keygrip) => (ctx: IContextRefresh, next: Next) => Promise<void>
```

Guard for the **refresh endpoint only** — not a general resource handler. The client sends the refresh token as a signed cookie (no `Authorization` header involved here). Delegates cookie parsing + signature verification to `verifySignedRefreshToken(ctx, keys)`, which returns an already-prefixed Redis key (`refresh:<uuid>`). Looks that key up with `redisClient.hGetAll`; if present, applies the same `disabled`/`deleted` → 403 check as `authenticatedResourceHandler`, then sets `ctx.state.user = { ...redData, id: new Types.ObjectId(redData.id), refreshToken: refreshTokenRedis }`. If the Redis hash is empty, falls back to the `x-introspectioncode` bypass exactly like the resource handler, else throws. Ends with `next()`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| keys | Keygrip | Keygrip instance (secret keys) used to verify the `refresh_token`/`refresh_token.sig` cookie pair. |

**Returns:** `(ctx, next) => Promise<void>` — the Koa middleware.

**Throws:** everything `verifySignedRefreshToken` can throw (`412`, `499` ×2, `401` — see below), plus:
- `403 Forbidden` (`throwForbiddenError`) — session marked `disabled`/`deleted`.
- `498 Invalid Token` (`throwRefreshTokenExpiredOrDeleted`) — no Redis session for the refresh key and no valid `x-introspectioncode`.

**Notes:** `ctx.state.user.refreshToken` is stored **with** its `refresh:` prefix already applied — do not re-prefix it downstream. Reads env `REDIS_KEY`, `INTROSPECTION_CODE`.

## `verifySignedRefreshToken`

**Import:** `import { verifySignedRefreshToken } from '@axiumine/koa-utils/koa/middleware/authenticatedAuthorizationHandler/verifySignedRefreshToken'`

**Signature:**
```ts
export function verifySignedRefreshToken(ctx: IContextRefresh, keys: Keygrip): string
```

Parses the raw `Cookie` header (`ctx.request.header.cookie`) by hand — splitting on `;` then `=` per pair — into a `TCookieRefreshToken` map, rather than relying on `ctx.cookies`. Extracts `refresh_token` and `refresh_token.sig`, then verifies the signature with `keys.index(\`refresh_token=${refreshToken}\`, signature)` (Keygrip). Returns the Redis-ready key.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| ctx | IContextRefresh | Koa-like context exposing `request.header.cookie` as a raw string. |
| keys | Keygrip | Keygrip instance used to validate the cookie signature. |

**Returns:** `string` — `` `refresh:${refreshToken}` `` — the `refresh:` prefix is **already included**; callers must not prepend it again (a documented double-prefix pitfall).

**Throws:**
- `412 Precondition Failed` (`throwPreconditionFailedNoAuthCookie`) — no `Cookie` header at all.
- `499 Token Required` (`throwRefreshTokenRequired`) — `refresh_token` cookie missing.
- `499 Token Required` (`throwRefreshTokenSignatureRequired`) — `refresh_token.sig` cookie missing.
- `401 Unauthorized` (`throwUnauthorizedError('Invalid Refresh Cookie signature')`) — `keys.index(...)` returns `-1` (signature doesn't match any registered Keygrip secret).

**Notes:** source carries a `@todo`: *"deve controllare il cookie o l'header o entrambi e cosa fare se manca uno dei due"* (should also consider validating via header, and what to do if only one of cookie/header is present) — currently only the cookie path is implemented; do not silently resolve this without coordinating with the owner.

## `TCookieRefreshToken`

**Import:** `import { TCookieRefreshToken } from '@axiumine/koa-utils/koa/middleware/authenticatedAuthorizationHandler/TCookieRefreshToken'`

**Signature:**
```ts
export type TCookieRefreshToken = {
	refresh_token?: string
	'refresh_token.sig'?: string
}
```

Shape of the hand-parsed `Cookie` header map produced inside `verifySignedRefreshToken`. Both fields are optional because either may be absent from the raw header before the corresponding `throwRefreshTokenRequired` / `throwRefreshTokenSignatureRequired` checks run.

## `authenticatedLogoutHandler`

**Import:** `import { authenticatedLogoutHandler } from '@axiumine/koa-utils/koa/middleware/authenticatedLogoutHandler'`

**Signature:**
```ts
export const authenticatedLogoutHandler: (keys: Keygrip) => (ctx: IContextLogout, next: Next) => Promise<void>
```

Middleware for the logout endpoint. Reads both credentials: the signed refresh cookie (`ctx.request.header.cookie`) and the `Authorization` header (`Bearer ACCESS_TOKEN`, optional at logout). If either is missing, it is tolerated **only** when `ctx.request.header['x-introspectioncode']` matches `process.env.INTROSPECTION_CODE`, which sets an internal `introspection = true` flag and skips all further checks; otherwise the corresponding precondition error is thrown. When not in introspection mode: calls `verifySignedRefreshToken(ctx as unknown as IContextRefresh, keys)` to get the `refresh:<uuid>` key, then `redisClient.hGet(key, 'id')` — if `null` (already logged out / expired), throws `throwAlreadyDone()`; otherwise sets `ctx.state = { user: { refreshToken } }`. It then optionally checks the access token: strips `Bearer `, and if non-empty, looks up `${REDIS_KEY}<access-key>` via `hGet(..., 'id')` — if found, adds `accessToken` to `ctx.state.user`; if not found, this is **not** an error (the access session may simply have already expired, which is fine during logout). Ends with `next()`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| keys | Keygrip | Keygrip instance used by `verifySignedRefreshToken` to verify the refresh cookie signature. |

**Returns:** `(ctx, next) => Promise<void>` — the Koa middleware.

**Throws:**
- `412 Precondition Failed` (`throwPreconditionFailedNoAuthCookie`) — cookie header missing and no valid `x-introspectioncode`.
- `412 Precondition Failed` (`throwPreconditionFailedNoAuthHeader`) — `Authorization` header missing and no valid `x-introspectioncode`.
- everything `verifySignedRefreshToken` can throw (`412`, `499` ×2, `401`) when parsing/verifying the refresh cookie.
- `204 No Content` (`throwAlreadyDone()`) — refresh key not found in Redis (already logged out); note `tdwKoaErrorHandler` skips the response body for status `204`, so clients must not expect a JSON payload here.

**Notes:** reads env `REDIS_KEY`, `INTROSPECTION_CODE`. The access-token half of the flow is deliberately soft-failing (no throw) — only the refresh half is mandatory for a successful logout.

## `debugHandler`

**Import:** `import { debugHandler } from '@axiumine/koa-utils/koa/middleware/debug'`

**Signature:**
```ts
export const debugHandler: () => (ctx: IContextRefresh, next: Next) => Promise<void>
```

Pure diagnostic pass-through — performs no validation and populates nothing. Logs, via `console.debug`: the current timestamp, the full `ctx.request.header` object, `ctx.request.header?.cookie`, and `ctx.cookies.get('refresh_token')`, then immediately calls `next()`. Intended to be wired in ahead of the real auth middleware during live debugging of cookie/header propagation issues.

**Returns:** `(ctx, next) => Promise<void>` — always resolves via `next()`; never throws.

**Notes:** the `console.debug` calls are intentional and must not be stripped — the owner uses them for live debugging.

## `routerVerifyEmail`

**Import:** `import { routerVerifyEmail } from '@axiumine/koa-utils/koa/router/verifyEmail'`

**Signature:**
```ts
export const routerVerifyEmail: () => (ctx: IContextVerifyEmail) => Promise<void>
```

Koa **router** handler (terminal — no `next`) for the email-verification link, e.g. `GET /check/verify-email/:email/:hash`. Reads `email`/`hash` from `ctx.params`, lowercases the email (no `.trim()`, unlike `checkEmailLen`/`checkPwdLen` elsewhere in the codebase), then calls `userData4VerifyEmail(uEmail)` → `assertVerifyEmailAllowed(user, email, hash)` → `enableEmailAccess(uId, email)`. `assertVerifyEmailAllowed` runs the guard chain internally, in order: `handleIfEmailAlreadyValid` → `handleBadDB` → `handleIfTooMuchRequestsTimes` → `handleIfHashBad` → `handleIfMoreThan3DaysPassed` → `handleIfAccountDeleted` → `handleIfAccountDisabled`. On success the handler redirects to `/x/registration-done`. Any thrown `Error` is caught: its `.message` is treated as a redirect path — if it matches `ALLOW_ENCODED_URLS_AFTER_X` (`/^\/x\/[a-zA-Z0-9._\-%/]+$/`), the handler redirects there (letting the internal guard chain drive the failure landing page, e.g. `/x/error?reason=...`); any other message falls back to the generic `/x/error`.

**Returns:** `Promise<void>` — always resolves by calling `ctx.redirect(...)`; never throws outward (errors are caught internally and converted to a redirect).

**Notes:** all of `userData4VerifyEmail`, `enableEmailAccess`, `assertVerifyEmailAllowed`, `handleBadDB`, and the `handleIf*` chain live under `@private/lib/access/**`, and `IContextVerifyEmail` under `@private/graphQL/schema/context/**` — these are internal-only and are **not** exported from the package (`**Import:** _internal — not exported_` for all of them); only `routerVerifyEmail` itself is a public export. The whole handler body is wrapped in `/* c8 ignore start ... stop */` because of an ESM live-binding limitation — the inner private handlers are non-configurable under the `tsx` test loader, so coverage of this function is asserted at the consumer/integration level rather than in this package's own suite.
