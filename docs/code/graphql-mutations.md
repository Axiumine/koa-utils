# GraphQL — Mutations (Auth & Account)

This section documents the auth-flow GraphQL mutation objects shipped by `@axiumine/koa-utils`: sign-up, the three login variants, logout, refresh, password reset/change, and email-change hash verification. Every export here is a plain object of shape `{ description, type, args?, resolve }` meant to be dropped straight into a `graphql`/`graphql-http` schema's `Mutation` fields. Most of them open a `mongoose.startSession()` + `session.withTransaction(...)` block and funnel every caught error through `tryCatchRethrow`, which maps MongoDB duplicate-key errors to `409 Conflict`, `[Validator]`-prefixed messages to `400 Bad Request`, re-throws any other `GraphQLError` with its own `extensions.http.status`, and reports anything else to Sentry before throwing a generic `500 Internal Server Error`. `logout`, `refresh` and `emailChangeHashVerify` are the exceptions — they do not use a mongoose transaction at all. Session tokens (access/refresh) are opaque `uuid` strings stored in Redis under `${process.env.REDIS_KEY}access:<uuid>` / `${process.env.REDIS_KEY}refresh:<uuid>`, and the refresh token is always carried in an `httpOnly`, `sameSite:Strict`, `secure:false` cookie (`secure` is intentionally left off here — TLS termination and the `secure` flag are applied at the Nginx layer).

## `signUp`

**Import:** `import { signUp } from '@axiumine/koa-utils/graphQL/schema/mutations/signUp'`

**Signature:**
```ts
interface IArgs {
	email: string
	password: string
}

export const signUp = {
	description: 'Sign Up',
	type: new GraphQLNonNull(GraphQLBoolean),
	args: {
		email: { type: new GraphQLNonNull(GraphQLString) },
		password: { type: new GraphQLNonNull(GraphQLString) }
	},
	async resolve(_: unknown, args: IArgs): Promise<boolean>
}
```

Registers a new user account. Normalizes the email (`toLowerCase().trim()`), validates length via `checkEmailLen` / `checkPwdLen`, then runs inside a `mongoose.startSession()` transaction: it checks `userExist(uEmail, session)` first; if the user already exists it sends an "email already valid" notice via `SocketLabsLib.emailAlreadyValid(uEmail)` **and then still throws** `throwConflictError()` (409) — both the notification email and the 409 happen, by design, as a privacy/timing trade-off (do not remove either side). If the user does not exist, `registerNewUser(uEmail, password, session)` creates the Mongo document (`account.email.valid = false`, a fresh email-hash) and returns the confirmation hash, and `SocketLabsLib.sendEmailVerify(uEmail, hashConfirmEmail)` sends the verification link. Any error is passed to `tryCatchRethrow`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| email | `String!` | New account's email; normalized to lower-case/trimmed before validation |
| password | `String!` | Plaintext password; hashed downstream by `registerNewUser` (bcrypt, `SALT_ROUNDS=14`) |

**Returns:** `Boolean!` — always `true` on success (resolver only returns after the transaction commits without error).

**Throws:**
- `400 Bad Request` — `checkEmailLen` / `checkPwdLen` validation failure, or a Mongo `[Validator]`-prefixed error remapped by `tryCatchRethrow`.
- `409 Conflict` — email already registered (`throwConflictError` → `throwAlreadyTakenError`), or a Mongo duplicate-key error remapped by `tryCatchRethrow`.
- `500 Internal Server Error` — any other uncaught error (reported to Sentry inside `tryCatchRethrow`).

**Notes:** Runs in a `mongoose.startSession()` transaction; `session.endSession()` always runs in `finally`.

## `loginRememberme`

**Import:** `import { loginRememberme } from '@axiumine/koa-utils/graphQL/schema/mutations/loginRememberme'`

**Signature:**
```ts
interface IArgs {
	email: string
	password: string
	rememberMe: boolean
}

export const loginRememberme = {
	description: 'login in platform with remember me flag',
	type: new GraphQLNonNull(LoginType),
	args: {
		email: { type: new GraphQLNonNull(GraphQLString) },
		password: { type: new GraphQLNonNull(GraphQLString) },
		rememberMe: { type: new GraphQLNonNull(GraphQLBoolean) }
	},
	async resolve(_: unknown, args: IArgs, ctx: IContextLogin): Promise<{ accessToken: string }>
}
```

Logs a normal (non-admin) user in, honoring a `rememberMe` flag. Normalizes/validates email and password, then inside a transaction calls `checkUserLoginAuthorization(uEmail, password, session)` — which looks the user up (`infoUserForLogin`, throws `401` if no such email) and validates the account (`_finalizeLoginCheck`: throws `403` if the email is unverified, the password does not match, the account is `deleted`, or the account is `disabled` — sending an "account disabled" notice for the last case). On success it calls `updateLoginStatsRememberme(uId, user.lastLogin, rememberMe, session)`, generates a fresh `accessToken`/`refreshToken` (uuid v4 each) and an `accessTokenExpiry()` (a **30–90 minute jitter**, in seconds — never a constant), stores the session via `setRedisLoginSession(uId, accessToken, accTokenExp, refreshToken)`, and sets the refresh cookie via `setLoginCookies(ctx, refreshToken)`. On any error the local `accessToken` variable is reset to `''`, the error is reported to Sentry directly, and then re-thrown via `tryCatchRethrow`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| email | `String!` | User email; normalized to lower-case/trimmed before validation |
| password | `String!` | Plaintext password, compared via bcrypt inside `_finalizeLoginCheck` |
| rememberMe | `Boolean!` | Forwarded to `updateLoginStatsRememberme`; does not change token TTLs |

**Returns:** `LoginType!` → `{ accessToken: String! }`.

**Throws:**
- `400 Bad Request` — `checkEmailLen` / `checkPwdLen` validation failure.
- `401 Unauthorized` — no user with that email (`infoUserForLogin`).
- `403 Forbidden` — unverified email, wrong password, deleted account, or disabled account (`_finalizeLoginCheck`).
- `500 Internal Server Error` — Redis write failure inside `setRedisLoginSession`, or any other uncaught error.

**Notes:** Runs in a `mongoose.startSession()` transaction. Both the resolver's own `catch` and `tryCatchRethrow`'s generic branch can call `Sentry.captureException` for the same non-Mongo/non-GraphQL error.

## `login4Ever`

**Import:** `import { login4Ever } from '@axiumine/koa-utils/graphQL/schema/mutations/login4Ever'`

**Signature:**
```ts
interface IArgs {
	email: string
	password: string
}

export const login4Ever = {
	description: 'login in platform WITHOUT remember me flag',
	type: new GraphQLNonNull(LoginType),
	args: {
		email: { type: new GraphQLNonNull(GraphQLString) },
		password: { type: new GraphQLNonNull(GraphQLString) }
	},
	async resolve(_: unknown, args: IArgs, ctx: IContextLogin): Promise<{ accessToken: string }>
}
```

Identical flow to `loginRememberme` but with no `rememberMe` argument: validates email/password, authenticates via `checkUserLoginAuthorization`, updates stats via `updateLoginStats4ever(uId, user.lastLogin, session)`, generates access/refresh tokens with the same **30–90 minute jitter** expiry, stores the Redis session with `setRedisLoginSession`, and sets the refresh cookie with `setLoginCookies`. Same error handling: local `accessToken` reset to `''`, `Sentry.captureException(e)`, then `tryCatchRethrow(e)`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| email | `String!` | User email; normalized to lower-case/trimmed before validation |
| password | `String!` | Plaintext password, compared via bcrypt |

**Returns:** `LoginType!` → `{ accessToken: String! }`.

**Throws:**
- `400 Bad Request` — `checkEmailLen` / `checkPwdLen` validation failure.
- `401 Unauthorized` — no user with that email.
- `403 Forbidden` — unverified email, wrong password, deleted account, or disabled account.
- `500 Internal Server Error` — Redis write failure, or any other uncaught error.

**Notes:** Runs in a `mongoose.startSession()` transaction. Contains commented-out `console.debug` trace lines (`[login4Ever] ...`) preserved for live debugging — do not strip.

## `loginAdmin`

**Import:** `import { loginAdmin } from '@axiumine/koa-utils/graphQL/schema/mutations/loginAdmin'`

**Signature:**
```ts
interface IArgs {
	email: string
	password: string
	rememberMe: boolean
}

export const loginAdmin = {
	description: 'login admin in platform',
	type: new GraphQLNonNull(LoginType),
	args: {
		email: { type: new GraphQLNonNull(GraphQLString) },
		password: { type: new GraphQLNonNull(GraphQLString) },
		rememberMe: { type: new GraphQLNonNull(GraphQLBoolean) }
	},
	async resolve(_: unknown, args: IArgs, ctx: IContextLogin): Promise<{ accessToken: string }>
}
```

Same shape and error handling as `loginRememberme`, but authenticates against the separate admin-user collection: `checkUserAdminLoginAuthorization(uEmail, password, session)` calls `infoUserAdminForLogin` (queries `UserAdminKoaUtils`, throws `401` if not found) then the shared `_finalizeLoginCheck` (throws `403` for unverified/wrong-password/deleted/disabled). Stats are updated via `updateAdminLoginStats(uId, user.lastLogin, rememberMe, session)`. Token generation, Redis session storage, and cookie-setting are identical to the other two login mutations (uuid tokens, **30–90 minute** access-token jitter).

**Parameters:**

| Name | Type | Description |
|---|---|---|
| email | `String!` | Admin email; normalized to lower-case/trimmed before validation |
| password | `String!` | Plaintext password, compared via bcrypt |
| rememberMe | `Boolean!` | Forwarded to `updateAdminLoginStats` |

**Returns:** `LoginType!` → `{ accessToken: String! }`.

**Throws:**
- `400 Bad Request` — `checkEmailLen` / `checkPwdLen` validation failure.
- `401 Unauthorized` — no admin user with that email.
- `403 Forbidden` — unverified email, wrong password, deleted account, or disabled account.
- `500 Internal Server Error` — Redis write failure, or any other uncaught error.

**Notes:** Runs in a `mongoose.startSession()` transaction. Use this instead of `loginRememberme`/`login4Ever` for admin-panel style logins where credentials live in a separate collection.

## `logout`

**Import:** `import { logout } from '@axiumine/koa-utils/graphQL/schema/mutations/logout'`

**Signature:**
```ts
export const logout = {
	description: 'logout',
	type: new GraphQLNonNull(GraphQLBoolean),
	async resolve(_: unknown, {}, ctx: IContextLogout): Promise<boolean>
}
```

Ends the current session. Deletes the refresh-token Redis key (`${REDIS_KEY}${buildPrefixedRedisKey('refresh:', ctx.state.user.refreshToken)}`) unconditionally, and additionally deletes the access-token Redis key (`${REDIS_KEY}${buildPrefixedRedisKey('access:', ctx.state.user.accessToken)}`) only if `ctx.state.user?.accessToken` is a non-empty string. `buildPrefixedRedisKey` is idempotent — it prepends the `'refresh:'`/`'access:'` prefix only if the token doesn't already carry it — because `ctx.state.user.refreshToken`/`accessToken` already arrive prefixed from `authenticatedLogoutHandler`, and naive concatenation would double-prefix and delete a key that was never written. Clears the `refresh_token` cookie via `ctx.cookies.set('refresh_token', '', refreshTokenOptions)`. Any error thrown by the Redis calls is swallowed and only reported to Sentry — the mutation never throws and always returns `true`.

**Returns:** `Boolean!` — always `true`, even if the Redis deletes failed.

**Notes:** Takes no GraphQL `args`; relies entirely on `ctx.state.user` (populated by `authenticatedResourceHandler` upstream). Does **not** open a mongoose session/transaction — it only touches Redis and the cookie jar. Errors are intentionally swallowed (only `Sentry.captureException(e)`), so a logout call can never surface a GraphQL error to the client.

## `refresh`

**Import:** `import { refresh } from '@axiumine/koa-utils/graphQL/schema/mutations/refresh'`

**Signature:**
```ts
export const refresh = {
	description: 'refresh token',
	type: new GraphQLNonNull(RefreshType),
	async resolve(_: unknown, {}, ctx: IContextRefresh): Promise<{ status: boolean; accessToken: string }>
}
```

Rotates both tokens for an already-authenticated session (called against the refresh endpoint, guarded upstream by `authenticatedAuthorizationHandler`). Reads `ctx.state.user.id` and the old `ctx.state.user.refreshToken`, generates brand-new `accessToken`/`refreshToken` (uuid v4), builds the Redis keys `${REDIS_KEY}access:<newAccessToken>` / `${REDIS_KEY}refresh:<newRefreshToken>`, and `hSet`s: the access key gets the full `ctx.state.user` payload minus `refreshToken` (deleted first), the refresh key gets `{ id: userId }`. Sets expiries with `Promise.all([...expire access with accessTokenExpiry() (30–90 min jitter), expire refresh with REFRESH_TOKEN_EXPIRY (90 days)])`, calls `setLoginCookies(ctx, refreshToken)` to write the new refresh cookie, then deletes the **old** refresh key: `redisClient.del(`${REDIS_KEY}${oldRefresh}`)` — note `ctx.state.user.refreshToken` already includes the `refresh:` prefix, so this key is *not* double-prefixed. On any Redis error, both newly-created keys are deleted, `accessToken` is reset to `''`, the error is Sentry-captured, and `tryCatchRethrow` re-throws.

**Returns:** `RefreshType!` → `{ status: Boolean!, accessToken: String! }`. `status` is `false` and `accessToken` is `''` only on the (rethrown) error path — in practice the resolver throws before returning in that case.

**Throws:** `500 Internal Server Error` — any Redis `hSet`/`expire`/`del` failure during token rotation, via `tryCatchRethrow`'s generic-error branch (also reported to Sentry directly).

**Notes:** Takes no GraphQL `args`. Does **not** use a mongoose session — it is pure Redis I/O. `REFRESH_TOKEN_EXPIRY` is a fixed `90 * 24 * 60 * 60` seconds (90 days); the access-token TTL is the same jittered `accessTokenExpiry()` used by the login mutations.

## `resetPwd`

**Import:** `import { resetPwd } from '@axiumine/koa-utils/graphQL/schema/mutations/resetPwd'`

**Signature:**
```ts
interface IArgs {
	email: string
}

/**
 * Take the user email and send an email with a link for change the password.
 * for privacy, true is returned whatever happens: unknown address, first request, or a request
 * throttled because the previous one is less than 10 minutes old. The caller can never tell them apart.
 */
export const resetPwd = {
	description: 'send reset password link',
	type: new GraphQLNonNull(GraphQLBoolean),
	args: {
		email: { type: new GraphQLNonNull(GraphQLString) }
	},
	async resolve(_: unknown, args: IArgs): Promise<boolean>
}
```

Sends a "reset your password" email, rate-limited to one every 10 minutes. Normalizes/validates the email, then inside a transaction calls `getResetPwd(session, uEmail)`; if the email does **not** exist it silently does nothing and still returns `true` (deliberate privacy behavior — the caller cannot distinguish "sent" from "no such account"). If it does exist: if a previous reset request (`resetDateReq`) was made less than 10 minutes ago, it also silently does nothing and returns `true` — the throttle is enforced (no new hash written, no email sent) but never disclosed; otherwise it generates a fresh random hash (`StringLib.randomString(EMAIL_HASH_LEN)`), persists it via `saveResetReq(session, resetPwdVal._id, nowDt, hash)`, and hands the hash to the post-commit block, which queues the reset-link email via `SocketLabsLib.sendEmailReset(uEmail, hash, resetPwdVal.name)` **after** the transaction has committed and **without awaiting it**. The hash is stored in `account.resetHash`, which is disjoint from the `account.email.hash` slot used by signup activation and email-change — a reset request therefore never invalidates a verification link the user is already holding, and a verification hash is never accepted by `updatePassword`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| email | `String!` | Account email to send the reset link to; normalized to lower-case/trimmed |

**Returns:** `Boolean!` — always `true`, regardless of whether the email existed or the request was throttled.

**Throws:**
- `400 Bad Request` — `checkEmailLen` validation failure, or a Mongo `[Validator]` error via `tryCatchRethrow`.
- `500 Internal Server Error` — any other uncaught error via `tryCatchRethrow`.

**Notes:** Runs in a `mongoose.startSession()` transaction. Never reveals whether the given email is registered — this is intentional and should not be "fixed".

Up to and including 5.1.1 the throttled case threw `throwTooManyRequestsError((10 - elapsedMin).toString())` (429) carrying the remaining wait in whole minutes. That answer could only ever reach a caller whose address was both registered and mid-reset, while an unknown address got `true` — an account-enumeration oracle on an unauthenticated mutation. The 429 is gone; the 10-minute throttle itself is unchanged. **Consumers that surfaced "please wait N minutes" in their UI must drop that branch** — a repeated request within the window is now indistinguishable from the first one. `throwTooManyRequestsError` itself is still exported and unchanged, it simply has no caller left in this package.

### Why the email is sent after the commit, and not awaited

The same version moved `sendEmailReset` out of the `withTransaction` callback and stopped awaiting it. Three separate reasons, only the first of which is about timing:

- **Timing.** Awaiting a network round-trip to SocketLabs made the response measurably slower in exactly one case: address registered *and* not throttled. That is the same fact the removed 429 used to state outright, so removing the status code while keeping the `await` would have left the oracle in place, just quieter. What remains in the awaited path is one extra `updateOne` — roughly a millisecond, against internet jitter an order of magnitude larger, and the 10-minute throttle caps an attacker at one sample per address, so there is no way to average the noise away.
- **Retries.** `session.withTransaction` re-runs its callback on a transient error. With the send inside, a retried commit mailed the user a second link, and the second `saveResetReq` invalidated the first one they may already have clicked.
- **Failure disclosure.** A SocketLabs outage used to propagate out of the transaction and surface as `500` — again, an answer only an address that actually exists could ever receive.

The costs, accepted deliberately: a delivery failure is now reported to Sentry (`captureException`) and nowhere else, the caller always sees `true`; and mail still in flight is lost if the process is killed before the request settles. Anything thrown synchronously on that path — including from the `SocketLabsLib` constructor — is caught and sent to Sentry rather than escaping the resolver, so the response is uniform whatever happens.

There is a third cost worth stating on its own, because it is the one a user notices: the hash and `resetDateReq` are already committed when the send is attempted, so **a failed send still arms the 10-minute throttle**. The user gets no link, and a retry inside the window is silently ignored — they wait out the window before a second request can produce anything.

Compensating for that — deleting `account.resetHash` / `account.resetDateReq` from the detached `.catch()` so the next request is not throttled — was considered and rejected. A rejected promise does not mean the message was not delivered: a timeout after SocketLabs accepted it would clear the hash while the link sits in the user's inbox, turning a slow send into a dead link. Waiting out the window is the safer of the two failures. Do not add the compensation without revisiting that trade.

## `updatePassword`

**Import:** `import { updatePassword } from '@axiumine/koa-utils/graphQL/schema/mutations/updatePassword'`

**Signature:**
```ts
interface IArgs {
	email: string
	hash: string
	password: string
}

export const updatePassword = {
	description: "cambia la password all'utente",
	type: new GraphQLNonNull(GraphQLBoolean),
	args: {
		email: { type: new GraphQLNonNull(GraphQLString) },
		hash: { type: new GraphQLNonNull(GraphQLString) },
		password: { type: new GraphQLNonNull(GraphQLString) }
	},
	async resolve(_: unknown, args: IArgs): Promise<boolean>
}
```

Completes the password-reset flow started by `resetPwd`. Normalizes/validates email and new password, then inside a transaction: `getResetPwd(session, uEmail)`; if `null` throws `throwForbiddenError()` (403, does not reveal that the email is unknown); if `resetHash` or `resetDateReq` is `null` it reports the record to Sentry via `captureMessage` and throws the same `throwForbiddenError()` (403 — reachable, not merely defensive: `getResetPwd` yields `resetHash === null` for every account with no `account.resetDateReq` at all, and also for any write that drops `account.resetHash` while leaving `account.resetDateReq` in place, since it deliberately does not fall back to `account.email.hash`); if the supplied `hash` does not match `resetPwd.resetHash` throws `throwForbiddenError()` (403); if more than 60 minutes have elapsed since `resetDateReq` (`DateLib.minElapsed`) throws `throwForbiddenError()` (403, link expired). If all checks pass, `updatePasswordDb(session, resetPwd._id, password)` re-hashes and persists the new password (throws `throwInternalError()` / 500 if the update reports failure), and `removeResetReq(session, uEmail)` clears the pending reset request. `SocketLabsLib.sendResetPwdConfirmation(uEmail, resetPwd.name)` then sends the confirmation email **after** the transaction has committed — awaited, unlike `resetPwd`'s send, but with any failure routed to Sentry rather than to the caller.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| email | `String!` | Account email; normalized via `trim().toLowerCase()` |
| hash | `String!` | Reset hash from the link sent by `resetPwd`; must match `resetPwd.resetHash` exactly |
| password | `String!` | New plaintext password; re-hashed by `updatePasswordDb` |

**Returns:** `Boolean!` — always `true` on success.

**Throws:**
- `400 Bad Request` — `checkEmailLen` / `checkPwdLen` validation failure, or a Mongo `[Validator]` error via `tryCatchRethrow`.
- `403 Forbidden` — every pre-write rejection: email not found, no usable `resetHash`/`resetDateReq` on the stored record (including an account that never requested a reset, a reset pending with `account.resetHash` gone, and any attempt to pass an `account.email.hash` verification hash here), hash mismatch, or reset link older than 60 minutes. All collapsed to one status, one title and one description, deliberately.
- `500 Internal Server Error` — a failed DB update (`updatePasswordDb` returning falsy), or any other uncaught error inside the transaction. Never reachable before the write, and no longer reachable from the confirmation email either.

**Notes:** Runs in a `mongoose.startSession()` transaction. Description string is intentionally in Italian (`"cambia la password all'utente"`) — preserve as-is.

Up to and including 5.1.1 the missing-`resetHash` case answered `500` instead of `403`. Because `getResetPwd` returns `resetHash === null` for every account whose `account.resetDateReq` is undefined — nearly the whole user base at any moment — the pair `403` (unknown address) / `500` (registered, no reset pending) was a plain account-enumeration oracle: unauthenticated, unthrottled, one address per request, with no timing difference to hide behind since neither path reaches bcrypt. The orphan-record signal that used to travel as a 500 now goes to Sentry as a `captureMessage`; the caller learns nothing either way. **Consumers must not branch on 500 vs 403 here** — a status-code check that used to mean "malformed reset state" now needs the Sentry alert instead.

### Why the confirmation email is sent after the commit

The same version moved `sendResetPwdConfirmation` out of the `withTransaction` callback. `session.withTransaction` re-runs its callback on a transient error, and with the send inside, a retried commit told the user twice that their password had changed — a second notice indistinguishable from someone else resetting the account again. It stays `await`ed: unlike `resetPwd` there is no timing oracle to close, because reaching that line at all requires a valid reset hash.

A delivery failure no longer fails the request. It used to abort the transaction and answer `500`, rolling back both the new password and `removeResetReq` — consistent, but it made the mail provider a hard dependency of the operation: while SocketLabs was down, no user could complete a password reset at all, however healthy the database was. The password is committed before the send now, so the failure goes to Sentry (`captureException`) and the caller still gets `true`. The confirmation is a notice, not part of the operation.

Aborting on a failed send is not an option that survives the move, and that is the whole reason the failure is swallowed: once the transaction has committed there is nothing left to abort. The only two alternatives are to rethrow (`500` describing a password change that did happen — the caller retries with a password that is already live) or to compensate by writing the previous bcrypt hash back, which this flow never reads and which would silently revoke a password the user may already have logged in with. Restoring the send to the inside of the callback would bring back both the duplicate notice on retry and the reverse inconsistency — mail delivered, commit then fails, user told about a change that never happened, and an email that cannot be recalled. Unlike `resetPwd`'s link, this message carries nothing the user needs in order to act, so losing it costs the operation nothing.

## `emailChangeHashVerify`

**Import:** `import { emailChangeHashVerify } from '@axiumine/koa-utils/graphQL/schema/mutations/emailChangeHashVerify'`

**Signature:**
```ts
interface IArgs {
	email: string
	hash: string
}

/**
 * Change email - Verify match between email and hash
 */
export const emailChangeHashVerify = {
	description: 'Change email - Verify match between email and hash',
	type: new GraphQLNonNull(GraphQLBoolean),
	args: {
		email: { type: new GraphQLNonNull(GraphQLString) },
		hash: { type: new GraphQLNonNull(GraphQLString) }
	},
	async resolve(_: unknown, args: IArgs): Promise<boolean>
}
```

Confirms an in-progress email-change request. Lower-cases the email (no `.trim()`, and — unlike the other mutations here — does **not** call `checkEmailLen`/`checkPwdLen`) and looks up `UserBase` by `account.email.newEmailTmp === uEmail`, projecting `_id account.email.hash account.email.dateLastReq account.email.requestTimes account.deleted account.disabled` via a `.lean()` read. If no user is found it logs `'email NON trovata '` and returns `false` (marked `@fixme throw` in source — deliberately not "fixed" without coordinating with the owner). If found, it compares `hash` against the stored `account.email.hash`:
- On mismatch: if `requestTimes` is `undefined` it throws `throwInternalError()` (500); otherwise it calls `incReqTimes(user._id)`, fires (without awaiting) `SocketLabsLib.wrongHash(uEmail, requestTimes)`, and returns `false`.
- On match: if `dateLastReq` is `undefined` it throws `throwInternalError()` (500). Otherwise it compares `dateLastReq` against "3 days ago" (`StringLib.isoToTimestamp`): if the request is older than 3 days it fires `SocketLabsLib.hashReqTooOld(uEmail)` (not awaited) and returns `false`; else if `account.deleted` it returns `false` silently; else if `account.disabled` it fires `SocketLabsLib.accountDisabled(uEmail)` (not awaited) and returns `false`; otherwise it re-checks that no other account already owns that email as `login.email` (`UserBase.countDocuments`) and, if free, calls `confirmNewEmail(user._id, uEmail)` and returns `true` — or returns `false` if the email was claimed in the meantime.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| email | `String!` | The new email address being confirmed; matched against `account.email.newEmailTmp` |
| hash | `String!` | Confirmation hash from the change-email link; matched against `account.email.hash` |

**Returns:** `Boolean!` — `true` only when the hash matches, the link is fresh (≤ 3 days), the account is neither deleted nor disabled, and the target email is still free; `false` on every other rejection branch.

**Throws:** `500 Internal Server Error` — stored record is missing `dateLastReq` (on hash match) or missing `requestTimes` (on hash mismatch); both are defensive branches marked `@fixme sentry` in source (they throw but do not currently call `Sentry.captureException` themselves).

**Notes:** Does **not** open a mongoose session/transaction — reads (`findOne`, `countDocuments`) and writes (`confirmNewEmail`, `incReqTimes`) are separate, non-atomic calls. Several rejection paths that arguably warrant a thrown error instead return `false` (see the `@fixme` comments in source) — this is a known, intentional-for-now quirk; do not silently change it.

The projection has to list every field the resolver reads. `account.email.requestTimes` was missing from it up to and including 5.1.0, and on a `.lean()` read a field left out of the projection is simply absent — so the hash-mismatch path always hit `typeof requestTimes === 'undefined'` and threw `500`. The strike counter never advanced, `SocketLabsLib.wrongHash` never reached the account owner, and a wrong hash (`500`) was distinguishable from an unknown address (`false`), which told a caller that a given address had an email change pending. Add a field to the resolver, add it to the `.select(...)`.

The `account.deleted` / `account.disabled` checks read the raw stored values: this is a `.lean()` query, so Mongoose casting never runs. They are real booleans only on data that `scripts/migrate-account-disabled-to-boolean.mjs` has been through — a legacy string `'false'` is truthy and rejects the confirmation. The migration is the fix; the mutation deliberately does not coerce.
