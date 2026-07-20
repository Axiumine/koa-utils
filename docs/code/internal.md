# Internal Helpers (private/)

Everything under `src/private/**` is **INTERNAL** — none of it appears in `package.json` `exports`, and per `CLAUDE.md` it must never be added there or imported by consumers. These modules exist purely to back the *public* surface (mutations like `signUp`, `loginRememberme`, `login4Ever`, `loginAdmin`, the `routerVerifyEmail` Koa router, and the image-upload wrappers `reEncodeToJpeg`/`reEncodeToPng`/`reEncodeToWebp`). This doc is for maintainers only: image re-encode/MIME sniffing internals, the `UserAdminKoaUtils` Mongo model, GraphQL context shapes used by internal resolvers, the login-check pipeline (Mongo + SQL variants, Redis session write), and the `handleIf*`/`db/*` chain that backs email verification. Every symbol below has **Import:** `_internal — not exported_` since none of it is reachable from outside the package.

## `files/` — image re-encode & MIME sniffing

### `reEncode`

**Import:** _internal — not exported_

**Signature:**
```ts
type AvailableFormatInf = 'jpeg' | 'png' | 'webp' | 'avif'

export async function reEncode(filePath: string, ext: keyof FormatEnum | AvailableFormatInf, quality = 100)
```

Re-encodes an image file to `ext` via `sharp`, stripping metadata/EXIF, and returns the new file path. It swaps the extension in `filePath` (regex-replacing the last dot-segment) to compute `finalFilepath`, then dispatches to `sharp(filePath).jpeg/png/webp/avif(...).withMetadata({}).withExif({}).toFile(finalFilepath)` depending on `ext`. `jpeg`/`png` use `{ quality, progressive: true }`; `webp`/`avif` use `{ quality, lossless: true }`. Any `sharp` failure is captured via `Sentry.captureException` and re-thrown as a plain `Error('Error processing the image')`. If the original file's extension differs from `ext`, the source file is `fs.unlink`ed afterward (failure there is captured and re-thrown as `throwInternalError()`).

**Parameters:**

| Name | Type | Description |
|---|---|---|
| filePath | string | Path to the source image on disk |
| ext | keyof FormatEnum \| AvailableFormatInf | Target format; only `'jpeg' \| 'png' \| 'webp' \| 'avif'` are actually handled |
| quality | number | Encode quality, default `100` |

**Returns:** `Promise<string>` — the new file path (`finalFilepath`), with the original extension replaced by `ext`.

**Throws:** Plain `Error('Error processing the image')` if `sharp` fails; `throwInternalError()` if the post-conversion `unlink` of the original file fails.

**Notes:** The type signature admits any `keyof FormatEnum`, but the if/else chain only encodes `jpeg`/`png`/`webp`/`avif` — passing any other format key silently skips the `sharp` call entirely, yet the function still proceeds to unlink the original file (if extensions differ) and returns a path to a file that was never written. Callers must restrict `ext` to the four handled values.

### `_validateMimeType`

**Import:** _internal — not exported_

**Signature:**
```ts
export const _validateMimeType = async (filePath: string, allowedMimeTypes: string[]): Promise<string> => { ... }
```

Validates a file's real MIME type via its magic number (not its extension or declared `Content-Type`), using a dynamic `import('file-type')`. Detects the type with `fileTypeFromFile(filePath)`; if detection fails, returns `''`. If the detected MIME type is in `allowedMimeTypes`, returns the detected file extension (`fileType.ext`); otherwise returns `''`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| filePath | string | Path to the file to sniff |
| allowedMimeTypes | string[] | Whitelist of acceptable MIME type strings |

**Returns:** `Promise<string>` — the detected extension if the MIME type is allowed, else `''` (used as a falsy "rejected" sentinel by callers such as the public `validateMimeType`).

### `assertNoTraversal`

**Import:** _internal — not exported_

**Signature:**
```ts
export function assertNoTraversal(value: string, name: string)
```

Rejects a path-traversal attempt in a value that gets interpolated into a filesystem path: throws `Error(`Invalid ${name}: path traversal`)` if `value` (split on `/` or `\`) contains a literal `..` segment. Deliberately narrow — it still allows separators, so a legitimate multi-segment value such as `2026/07` keeps working; a stricter `path.basename()` would close more but would silently rewrite `2026/07` to `07` and break published consumers. Used by `moveFileStaticDomain`, `moveTempFile`, and `moveImageFile`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| value | string | The caller-supplied value to check |
| name | string | Parameter name, used in the error message |

**Returns:** `void`.

**Throws:** `Error` — if `value` contains a `..` path segment.

## `graphQL/Consts`

Shared user-facing error copy for internal error paths.

| Name | Value | Used for |
|---|---|---|
| `ERR_MISCONFIGURED` | `'We have misconfigured some services. Our technicians are already fixing the problem. Please try again later.'` | Generic "our fault" message for internal/config failures |
| `ERR_OOPS` | `'Oops'` | Short generic error title |

**Import:** _internal — not exported_ (both).

## `graphQL/models/MongoDB/private/UserAdminKoaUtils`

The Mongoose model backing admin-panel logins, parallel to the (public-schema-adjacent) `UserBase` model but stored in its own `userAdmin` collection.

### `IInfoUserAdminForLogin`

**Import:** _internal — not exported_

**Signature:**
```ts
export interface IInfoUserAdminForLogin {
	_id: Types.ObjectId
	login: {
		password: string
		lastLogin?: Date
	}
	account: {
		email: {
			valid: boolean
		}
		rememberMe?: boolean
		disabled?: boolean
		deleted?: boolean
	}
}
```

The narrow projection shape returned by `infoUserAdminForLogin` — just enough fields to run the login-authorization check.

### `IUserAdminKoaUtilsSchema`

**Import:** _internal — not exported_

**Signature:**
```ts
export interface IUserAdminKoaUtilsSchema {
	_id: Types.ObjectId
	login: { _id?: boolean; email: string; password: string; firstLogin?: Date; lastLogin?: Date }
	account: {
		_id?: boolean
		email: { _id?: boolean; valid: boolean; dateLastReq?: Date; requestTimes?: number; hash?: string; newEmailTmp?: string }
		rememberMe?: boolean
		registrationDate: Date
		accountValidDate?: Date
		newsletter?: boolean
		resetDateReq?: Date
		disabled?: boolean
		deleted?: boolean
	}
	personalData: { _id: false; name: string; surname: string }
	__v?: number
}
```

Full document shape for the `userAdmin` collection.

**Notes:** The TS interface declares `account.disabled?: boolean`, but the actual `Schema` definition below it types `account.disabled` as `{ type: String, required: false }` — a Mongoose-vs-TypeScript mismatch. In practice `disabled` is stored as a string (mirrors the `redData?.disabled`/`redData?.deleted` truthy-string quirk noted for Redis elsewhere in this codebase) even though every consumer of `IUserAdminKoaUtilsSchema`/`IInfoUserAdminForLogin` types it as `boolean`.

### `UserAdminKoaUtils` (default export)

**Import:** _internal — not exported_

**Signature:**
```ts
export default model<IUserAdminKoaUtilsSchema>('UserAdminKoaUtils', UserAdminKoaUtilsSchema)
```

The compiled Mongoose model, collection name `userAdmin`. Used by `infoUserAdminForLogin` and `updateAdminLoginStats` to read/write admin login state.

## `graphQL/schema/context/`

Koa context shape interfaces used to type internal handlers.

### `IContextLog`

**Import:** _internal — not exported_

**Signature:**
```ts
export interface IContextLog {
	method: string
	url: string
	state: { user: { id: string } }
	request: { body?: { operationName: string } }
	status: number
}
```

Minimal shape of a Koa `ctx` needed to log a request (method, URL, authenticated user id, GraphQL operation name, response status).

### `IContextVerifyEmail`

**Import:** _internal — not exported_

**Signature:**
```ts
export interface IContextVerifyEmail {
	params: { email: string; hash: string }
	redirect(value: string): void
}
```

Shape of the Koa `ctx` for the email-verification route: route params (`email`, `hash`) plus the `redirect` method used to send the browser to `EMAIL_CHECK_LINK` (or a success page) once the `handleIf*` chain and `enableEmailAccess` have run.

## `graphQL/schema/mutations/` — login-check pipeline

Internal building blocks consumed by the public login mutations (`loginRememberme`, `login4Ever`, `loginAdmin`). All Mongo-writing functions here take a `mongoose.ClientSession` and are meant to run inside the caller's `session.withTransaction(...)`.

### `_buildLoginStatsUpdate`

**Import:** _internal — not exported_

**Signature:**
```ts
interface ISet { login?: { firstLogin?: Date; lastLogin?: Date }; account?: { rememberMe: boolean } }
interface IUnset { account?: { rememberMe: number } }

export function _buildLoginStatsUpdate(lastLogin: null | Date, rememberMe: boolean)
```

Pure helper that builds the `$set`/`$unset` payload shared by `updateAdminLoginStats` and `updateLoginStatsRememberme`. Always sets `login.lastLogin` to `new Date()`. Sets `login.firstLogin` to the same timestamp only when `lastLogin === null` (i.e. this is the user's first login). Sets `account.rememberMe = true` when `rememberMe` is truthy, otherwise adds `account.rememberMe` to `$unset` (value `1`) to remove the field entirely.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| lastLogin | null \| Date | The user's previously recorded last-login date, or `null` if this is their first login |
| rememberMe | boolean | Whether the "remember me" flag should be persisted |

**Returns:** `{ dbSet: ISet, dbUnset: IUnset }` — ready to spread into a Mongoose `updateOne`'s `$set`/`$unset`.

### `_finalizeLoginCheck`

**Import:** _internal — not exported_

**Signature:**
```ts
export interface ILoginUserShape {
	_id: Types.ObjectId
	login: { password: string; lastLogin?: Date }
	account: { email: { valid: boolean }; disabled?: boolean; deleted?: boolean }
}

export async function _finalizeLoginCheck(user: ILoginUserShape, uEmail: string, password: string)
```

Shared authorization logic for both the regular and admin login mutations, called after the user row has been fetched. Checks, in order: (1) `user.account.email.valid` — must be `true`; (2) `compareHashAsync(password, user.login.password)` — must match; (3) `user.account.deleted` — must be falsy; (4) `user.account.disabled` — must be falsy (and if disabled, first sends an "account disabled" notice via `new SocketLabsLib().accountDisabled(uEmail)`). Every failure path throws the **same** `throwForbiddenError()` (403) regardless of which check failed, so a caller cannot distinguish "wrong password" from "unverified email" from "disabled account" by status alone — this is intentional (timing/enumeration protection, same spirit as the `signUp` 409-vs-privacy tradeoff documented in `CLAUDE.md`).

**Parameters:**

| Name | Type | Description |
|---|---|---|
| user | ILoginUserShape | The fetched user projection (from `infoUserForLogin` or `infoUserAdminForLogin`) |
| uEmail | string | The email used to attempt login (used only for the disabled-account notification) |
| password | string | Plaintext password submitted by the caller |

**Returns:** `Promise<{ userId: Types.ObjectId, lastLogin: Date | null }>` — `userId` is `user._id`; `lastLogin` is `user.login.lastLogin ?? null`.

**Throws:** `throwForbiddenError()` (403) — if the email is unverified, the password doesn't match, the account is deleted, or the account is disabled.

### `infoUserForLogin`

**Import:** _internal — not exported_

**Signature:**
```ts
export async function infoUserForLogin(email: string, session: ClientSession): Promise<IInfoUserForLogin>
```

Fetches the minimal login-check projection (`_id`, `login.password`, `login.lastLogin`, `account.email.valid`, `account.deleted`, `account.disabled`) from `UserBase` by `login.email`, inside `session`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| email | string | Email to look up (`login.email`) |
| session | ClientSession | Mongoose session the read participates in |

**Returns:** `Promise<IInfoUserForLogin>` (type imported from `@models/MongoDB/UserBase.mjs`).

**Throws:** `throwUnauthorizedError()` (401) — if no user matches `email`.

### `infoUserAdminForLogin`

**Import:** _internal — not exported_

**Signature:**
```ts
export async function infoUserAdminForLogin(email: string, session: ClientSession): Promise<IInfoUserAdminForLogin>
```

Same projection/behavior as `infoUserForLogin`, but reads from `UserAdminKoaUtils` (the `userAdmin` collection) for the admin login flow.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| email | string | Email to look up (`login.email`) |
| session | ClientSession | Mongoose session the read participates in |

**Returns:** `Promise<IInfoUserAdminForLogin>`.

**Throws:** `throwUnauthorizedError()` (401) — if no admin user matches `email`.

### `infoUserForLoginSQL`

**Import:** _internal — not exported_

**Signature:**
```ts
export type InfoUserForLoginSQL = { id: number; password: string; valid: boolean; deleted: boolean; disabled: boolean }

export async function infoUserForLoginSQL(email: string): Promise<InfoUserForLoginSQL>
```

MariaDB/SQL equivalent of `infoUserForLogin`: runs `SELECT id, password, valid, deleted, disabled FROM user WHERE email=:email` via `sequelize.query` with a parameterized `:email` replacement (safe from SQL injection).

**Parameters:**

| Name | Type | Description |
|---|---|---|
| email | string | Email to look up |

**Returns:** `Promise<InfoUserForLoginSQL>` — the first matching row.

**Throws:** `throwErrorWrongUserInput("L'utente non esiste")` (Italian: "the user does not exist") — if the query returns zero rows.

### `checkUserLoginAuthorization`

**Import:** _internal — not exported_

**Signature:**
```ts
export async function checkUserLoginAuthorization(uEmail: string, password: string, session: ClientSession)
```

Orchestrates the regular (non-admin) login check: `infoUserForLogin(uEmail, session)` then `_finalizeLoginCheck(user, uEmail, password)`. Delegates all validation/throw behavior to those two.

**Returns:** `Promise<{ userId: Types.ObjectId, lastLogin: Date | null }>` (see `_finalizeLoginCheck`).

**Throws:** `throwUnauthorizedError()` (via `infoUserForLogin`) or `throwForbiddenError()` (via `_finalizeLoginCheck`).

### `checkUserAdminLoginAuthorization`

**Import:** _internal — not exported_

**Signature:**
```ts
export async function checkUserAdminLoginAuthorization(uEmail: string, password: string, session: ClientSession)
```

Admin equivalent of `checkUserLoginAuthorization`: `infoUserAdminForLogin(uEmail, session)` then `_finalizeLoginCheck(user, uEmail, password)`.

**Returns:** `Promise<{ userId: Types.ObjectId, lastLogin: Date | null }>`.

**Throws:** `throwUnauthorizedError()` or `throwForbiddenError()` (same as above, against the `userAdmin` collection).

### `setLastLoginSQL`

**Import:** _internal — not exported_

**Signature:**
```ts
export async function setLastLoginSQL(id: number): Promise<boolean>
```

MariaDB equivalent of the Mongo `updateLoginStats*` helpers: runs `UPDATE user SET lastlogin = :timestamp WHERE id = :id` (timestamp formatted `YYYY-MM-DD HH:MM:SS`) via `sequelize.query` with `id`/`timestamp` passed as `replacements`. On success returns `true`; on any thrown error, captures it via `Sentry.captureException` and returns `false` — **the error is swallowed, not rethrown**, so callers must check the boolean return rather than relying on a catch.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| id | number | Numeric user id (SQL row) |

**Returns:** `Promise<boolean>` — `true` on success, `false` on any DB error (logged to Sentry, not thrown).

**Notes:** Same parameterized-`replacements` pattern as `infoUserForLoginSQL`: the query is built with named placeholders (`UPDATE user SET lastlogin = :timestamp WHERE id = :id`) and `id`/`timestamp` are passed via `sequelize.query`'s `replacements` object, never interpolated into the SQL string.

### `setRedisLoginSession`

**Import:** _internal — not exported_

**Signature:**
```ts
export async function setRedisLoginSession(id: Types.ObjectId, accessToken: string, accTokenExp: number, refreshToken: string)
```

Writes both halves of a login session into Redis. Builds `keyAccess = ${process.env.REDIS_KEY}access:${accessToken}` and `keyRefresh = ${process.env.REDIS_KEY}refresh:${refreshToken}`, `hSet`s `{ id }` under `keyAccess` and `{ id, access: accessToken }` under `keyRefresh`, then sets `EXPIRE keyAccess accTokenExp` (seconds) and `EXPIRE keyRefresh REFRESH_TOKEN_EXPIRY` (imported from `@lib/tokens.mjs`). If any step throws, **both** keys are deleted (best-effort cleanup) before re-throwing `throwInternalError()`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| id | Types.ObjectId | The logged-in user's Mongo `_id` |
| accessToken | string | The newly generated access token (uuid) |
| accTokenExp | number | Access-token TTL in seconds (the 30–90 min jittered value from `accessTokenExpiry()`) |
| refreshToken | string | The newly generated refresh token (uuid) |

**Returns:** `Promise<void>`.

**Throws:** `throwInternalError()` — if either `hSet`/`expire` call fails; both Redis keys are deleted first.

**Notes:** Confirms the `${REDIS_KEY}access:<uuid>` / `${REDIS_KEY}refresh:<uuid>` key convention from `CLAUDE.md`; calls `dotenv.config()` at module load to ensure `process.env.REDIS_KEY` is populated.

### `updateAdminLoginStats`

**Import:** _internal — not exported_

**Signature:**
```ts
export async function updateAdminLoginStats(id: Types.ObjectId, lastLogin: null | Date, rememberMe: boolean, session: ClientSession)
```

Applies `_buildLoginStatsUpdate(lastLogin, rememberMe)`'s `$set`/`$unset` to `UserAdminKoaUtils` via `updateOne({ _id: id }, ..., { session, runValidators: true })`.

**Returns:** `Promise<void>`.

### `updateLoginStats4ever`

**Import:** _internal — not exported_

**Signature:**
```ts
interface ISet { login?: { firstLogin?: Date; lastLogin?: Date } }

export async function updateLoginStats4ever(id: Types.ObjectId, lastLogin: null | Date, session: ClientSession)
```

Login-stats updater for the "log in forever" (`login4Ever`) flow against `UserBase`. Always sets `login.lastLogin`; sets `login.firstLogin` too when `lastLogin === null`. Unlike `updateLoginStatsRememberme`/`updateAdminLoginStats`, it has **no `rememberMe` handling** — it does not touch `account.rememberMe` at all, since the "4ever" flow has no remember-me toggle.

**Returns:** `Promise<void>`.

### `updateLoginStatsRememberme`

**Import:** _internal — not exported_

**Signature:**
```ts
export async function updateLoginStatsRememberme(id: Types.ObjectId, lastLogin: null | Date, rememberMe: boolean, session: ClientSession)
```

Applies `_buildLoginStatsUpdate(lastLogin, rememberMe)`'s `$set`/`$unset` to `UserBase` via `updateOne({ _id: id }, ..., { session, runValidators: true })`. Mirrors `updateAdminLoginStats` but against the regular user collection.

**Returns:** `Promise<void>`.

## `lib/access/Constants`

**Import:** _internal — not exported_ (both).

| Name | Value | Description |
|---|---|---|
| `SALT_ROUNDS` | `14` | Bcrypt cost factor used by the access flow. Matches the intentional `SALT_ROUNDS=14` referenced in `CLAUDE.md` — do not lower it. |
| `EMAIL_CHECK_LINK` | `'/x/email-check'` | Redirect path baked into the `.message` of every `Error` thrown by the `handleIf*` guard chain below (consumed by the `routerVerifyEmail` Koa router as a redirect target, not surfaced as a GraphQL error). |

## `lib/access/db/` — email-verification & reset-password DB writes

All internal, all operate on the `UserBase` Mongoose model. Four are **default exports** — `confirmNewEmail`, `deleteUserByEmail`, `removeResetReq`, and `updatePassword` (defined in `updatePasswordDb.mts`, where file name and export name differ); the rest are named exports.

| Symbol | Signature | Description |
|---|---|---|
| `confirmNewEmail` (default) | `(_id: ObjectId, email: string) => Promise<...>` | Finalizes an email-change: `$set`s `login.email` to the new address and `$unset`s `account.email.hash`/`dateLastReq`/`requestTimes`/`newEmailTmp`. |
| `deleteUserByEmail` (default) | `(email: string) => Promise<void>` | Deletes the user document matching `login.email`. Carries a `// @todo report on Sentry` comment and a commented-out `deletedCount === 0` check — deletion result is currently unchecked. |
| `enableEmailAccess` | `(_id: ObjectId, email: string) => Promise<void>` | Sets `account.email.valid = true`, clears `hash`/`dateLastReq`/`requestTimes` (`runValidators: true`), then sends the welcome email via `new SocketLabsLib().sendWelcome(email)`. This is the `enableEmailAccess` step in the `routerVerifyEmail` auth-flow cheat sheet. |
| `getResetPwd` | `(session: ClientSession, email: string) => Promise<{ _id, resetDateReq, resetHash, name } \| null>` | Looks up password-reset state (`account.resetDateReq`, `account.email.hash`, `personalData.name`) via a `.lean()` read. `resetHash` is only populated when `resetDateReq` is defined; returns `null` if no user matches. |
| `incReqTimes` | `(_id: ObjectId) => Promise<UpdateWriteOpResult>` | `$inc`s `account.email.requestTimes` by 1 (`runValidators: true`). |
| `removeResetReq` (default) | `(session: ClientSession, email: string) => Promise<UpdateWriteOpResult>` | `$unset`s `account.resetDateReq`/`account.resetHash` by `login.email`. Note: passes `{ upsert: true }` — if no document matches the email, this creates a new (mostly empty) document rather than no-op. |
| `saveResetReq` | `(session: ClientSession, _id: Types.ObjectId, now: Date, hash: string) => Promise<void>` | `$set`s `account.resetDateReq = now` and `account.email.hash = hash` (`runValidators: true`). Catches errors and rethrows via `throwMongoDBErrors(e as IMongoDBError)`. |
| `setEmailHash` | `(session: ClientSession, idUtente: Types.ObjectId) => Promise<string>` | Generates a hash via `emailHash()`, `$set`s `account.email.hash`, resets `account.email.requestTimes = 1`, sets `account.email.dateLastReq = now` (`runValidators: true`); returns the generated hash. Carries an `@fixme` comment ("else it goes into exception @fixme check" — verify the failure path throws as expected). |
| `updatePassword` (default, file `updatePasswordDb.mts`) | `(session: ClientSession, _id: mongoose.Types.ObjectId, password: string) => Promise<UpdateWriteOpResult>` | Hashes `password` via `hash(password, SALT_ROUNDS)` and `$set`s `login.password` (`runValidators: true`). Note the default export is named `updatePassword`, not `updatePasswordDb` — the file name and the export name differ. Imported by the public mutation `updatePassword` (`src/graphQL/schema/mutations/updatePassword.mts`). |
| `userData4VerifyEmail` | `(uEmail: string) => Promise<user projection>` | `.lean()` read of `_id`, `account.email.hash/valid/dateLastReq/requestTimes`, `account.deleted/disabled` by `login.email`. If no user matches, calls `Sentry.captureMessage` then throws a plain `Error(EMAIL_CHECK_LINK)` (not a GraphQL error). |

## `lib/access/` — verification guard chain (`handleIf*`, `handleBadDB`)

`routerVerifyEmail` no longer calls these guards directly. It fetches the user via `userData4VerifyEmail`, then delegates the whole check to `assertVerifyEmailAllowed(user, email, hash)` (`src/private/lib/access/assertVerifyEmailAllowed.mts`), which is the function that actually calls the guards below in sequence — `handleIfEmailAlreadyValid`, `handleBadDB`, `handleIfTooMuchRequestsTimes`, `handleIfHashBad`, `handleIfMoreThan3DaysPassed`, `handleIfAccountDeleted`, `handleIfAccountDisabled` — and returns the user's `_id` once every guard has passed. The router then calls `enableEmailAccess` on that id. On failure the guards all throw a plain `Error` whose `.message` is a redirect path (`EMAIL_CHECK_LINK = '/x/email-check'` for every guard except `handleBadDB`, see below) rather than a `GraphQLError`; the router is expected to catch it and redirect using `e.message`. Maintainers adding a new guard must preserve this convention.

### `assertVerifyEmailAllowed`

**Import:** _internal — not exported_

**Signature:**
```ts
export interface IVerifyEmailUser {
	_id: Types.ObjectId
	account: {
		email: { hash?: string; valid: boolean; dateLastReq?: Date; requestTimes?: number }
		deleted?: boolean
		disabled?: boolean
	}
}

export async function assertVerifyEmailAllowed(user: IVerifyEmailUser, email: string, hash: string): Promise<Types.ObjectId>
```

Runs every guard that must pass before an email-verification link is honored, in order, against the projection `userData4VerifyEmail` returns. `dbHash` passed to `handleIfHashBad` is always the value stored on the account (`user.account.email.hash`), never the one supplied in the URL. Enabling the account is deliberately not done here — the caller (`routerVerifyEmail`) does it on the returned id, so that irreversible side effect can't be reordered ahead of a guard.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| user | IVerifyEmailUser | The projection returned by `userData4VerifyEmail` |
| email | string | The email from the verification URL |
| hash | string | The hash from the verification URL |

**Returns:** `Promise<Types.ObjectId>` — `user._id`, once every guard has passed.

**Throws:** Whatever the first failing guard throws (see the table below).

| Symbol | Signature | Description |
|---|---|---|
| `handleBadDB` | `(requestTimes?: number, dateLastReq?: Date) => void` | Invariant guard: if either argument is `undefined` (a hash present without `requestTimes`/`dateLastReq` should never happen), logs via `Sentry.captureMessage('[handleBadDB] DB ERROR', 'error')` and throws a plain `Error('/x/error')` — note this is the **hardcoded** path `/x/error`, not the `EMAIL_CHECK_LINK` constant used everywhere else in this group. |
| `handleIfAccountDeleted` | `(email: string, deleted: boolean = false) => Promise<void>` | If `deleted`, sends an "account disabled" notice via `new SocketLabsLib().accountDisabled(email)`, then throws `Error(EMAIL_CHECK_LINK)`. |
| `handleIfAccountDisabled` | `(email: string, disabled: boolean = false) => Promise<void>` | Same pattern as `handleIfAccountDeleted`, gated on `disabled`. |
| `handleIfEmailAlreadyValid` | `(uEmail: string, valid: boolean) => Promise<void>` | If `valid`, sends the "email already valid" notice via `SocketLabsLib().emailAlreadyValid(uEmail)`, then throws `Error(EMAIL_CHECK_LINK)`. Ties into the `signUp` "already valid" email + 409 dual-path behavior documented in `CLAUDE.md`. |
| `handleIfHashBad` | `({ uId, uEmail, hash, requestTimes = 0, dbHash }: IHandleIfHashBadArgs) => Promise<void>` | Single destructured object argument (`IHandleIfHashBadArgs = { uId: mongoose.Types.ObjectId; uEmail: string; hash: string; requestTimes?: number; dbHash?: string }`). If `hash !== dbHash`: increments the stored request counter via `incReqTimes(uId)`, sends `SocketLabsLib().wrongHash(uEmail, requestTimes + 1)`, then throws `Error(EMAIL_CHECK_LINK)`. |
| `handleIfMoreThan3DaysPassed` | `(uEmail: string, dateLastReq: Date = new Date()) => Promise<void>` | Computes "3 days ago" and compares timestamps via `StringLib.isoToTimestamp`; if `dateLastReq` is older than 3 days, sends `SocketLabsLib().hashReqTooOld(uEmail)`, **deletes the user account** (`deleteUserByEmail(uEmail)`), then throws `Error(EMAIL_CHECK_LINK)`. |
| `handleIfTooMuchRequestsTimes` | `(uEmail: string, requestTimes: number = 99) => Promise<void>` | If `requestTimes >= 5`, sends `SocketLabsLib().tooMuchVerifyRequests(uEmail)`, **deletes the user account** (`deleteUserByEmail(uEmail)`), then throws `Error(EMAIL_CHECK_LINK)`. |

**Import (all rows above):** _internal — not exported_.

**Notes:** `handleIfMoreThan3DaysPassed` and `handleIfTooMuchRequestsTimes` both permanently delete the user account as a side effect of the guard failing — there is no recovery path once either fires. `handleBadDB`'s hardcoded `/x/error` (vs. every sibling's `EMAIL_CHECK_LINK`) is a real inconsistency in this file, not a typo introduced here — preserve it unless the owner asks for a fix.

## `lib/makeBodyJson`

**Import:** _internal — not exported_

**Signature:**
```ts
export function makeBodyJson(message: string, description: string)
```

Tiny helper for building a raw JSON response body outside the GraphQL layer (e.g. from a plain Koa router handler). Equivalent to `JSON.stringify({ message, description })`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| message | string | Short message field |
| description | string | Longer description field |

**Returns:** `string` — the JSON-stringified `{ message, description }` object.

## `lib/verifyIntrospectionCode`

**Import:** _internal — not exported_

**Signature:**
```ts
export const verifyIntrospectionCode = (headerValue: string | undefined): boolean => { ... }
```

Constant-time check of the `x-introspectioncode` header against `process.env.INTROSPECTION_CODE`, via `Buffer.from` + `node:crypto`'s `timingSafeEqual`. Fails closed: if `INTROSPECTION_CODE` is unset or empty, or `headerValue` is not a string, or the two buffers differ in byte length, it returns `false` without calling `timingSafeEqual` (which throws on unequal-length buffers). Only when both are non-empty strings of equal byte length does it fall through to the constant-time comparison. Guards against the previous call-site pattern of comparing against the *interpolated* `` `${process.env.INTROSPECTION_CODE}` ``, which coerced an unset variable to the literal string `'undefined'` and let a client satisfy the check by sending that exact header value with no real secret configured. Used by three middlewares to allow an introspection bypass: `authenticatedResourceHandler`, `authenticatedAuthorizationHandler`, and `authenticatedLogoutHandler`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| headerValue | string \| undefined | The `x-introspectioncode` header value from the incoming request |

**Returns:** `boolean` — `true` only if `INTROSPECTION_CODE` is set and `headerValue` matches it byte-for-byte; `false` otherwise.
