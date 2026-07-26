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

**Notes:** `account.disabled` is `{ type: Boolean, required: false }`, matching the interface. It was `{ type: String }` through 5.0.3, which carried the same defect documented for `UserBase` in `docs/code/graphql-models.md`: Mongoose cast a stored boolean `false` to the truthy string `'false'` on the hydrated read `infoUserAdminForLogin` performs, so `_finalizeLoginCheck` locked out admins who were explicitly not disabled and mailed them an "account disabled" notice. Stored strings are not repaired by the schema change — run `scripts/migrate-account-disabled-to-boolean.mjs`, which covers the `userAdmin` collection as well as `user`. Do not confuse these document flags with the Redis session flags (`redData?.disabled`/`redData?.deleted`), which really are strings and are truthy for `'true'` and `'false'` alike.

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
| `EMAIL_CHECK_LINK` | `'/x/email-check'` | Redirect path baked into the `.message` of every `Error` thrown by the guard chain below — `handleBadDB` included, which threw a hardcoded `/x/error` through 5.6.1 (consumed by the `routerVerifyEmail` Koa router as a redirect target, not surfaced as a GraphQL error). One target for every rejection is what keeps the route from answering differently for a known and an unknown address. |

## `lib/access/db/` — email-verification & reset-password DB writes

All internal. Since 5.3.0 every one of them is a **factory** — `createXxx(model, paths)` returns the bound helper — plus a `UserBase`-bound default built with `DEFAULT_RESET_PWD_PATHS` / `DEFAULT_VERIFY_EMAIL_PATHS` from `@lib/access/accessPaths.mjs`. The signatures below are those of the *bound* helpers, which is what every existing caller imports; the paths quoted are the defaults. Four bound helpers are **default exports** — `confirmNewEmail`, `deleteUserByEmail`, `removeResetReq`, and `updatePassword` (defined in `updatePasswordDb.mts`, where file name and export name differ); the rest are named exports. Each module also exports a `T*` alias (`TGetResetPwd`, `TSaveResetReq`, …) so the resolvers can take the helper as a typed dependency.

The public entry point for binding them to another model is [`createResetPwdFlow` / `createVerifyEmailFlow`](./lib-access.md); do not build a second set of bindings by hand.

Reads walk the configured dotted paths out of the `.lean()` documents with `readPath`, writes build their `$unset` payloads with `buildUnset`, and projections are assembled with `buildProjection` — all three in `lib/access/pathTools.mts`:

| Symbol | Signature | Description |
|---|---|---|
| `readPath` | `(source: unknown, path: string) => unknown` | Walks a dotted path. Any missing or non-object link yields `undefined` rather than throwing, so the callers' `typeof x === 'undefined'` guards read a wrong path exactly like a projection that left the field out. Falsy stored values (`false`, `0`) are preserved. |
| `buildUnset` | `(paths: readonly string[]) => Record<string, ''>` | Maps each path to `''`, the value Mongo's `$unset` expects. The list is always the caller's `*Clear` list, never derived from the fields that were written. |
| `buildProjection` | `(paths: readonly string[]) => string` | Joins the paths into a `.select()` string, always prefixed with `_id`. |


| Symbol | Signature | Description |
|---|---|---|
| `createAbandonUser` (`abandonUser.mts`) | `({ model, paths, mode, deletedValue }: ICreateAbandonUserArgs) => TDeleteUserByEmail` | Factory only — no bound default, since the default policy *is* `deleteUserByEmail`. Picks the writer the two disposal guards run: `mode: 'delete'` returns `createDeleteUserByEmail(model, paths)`; `'soft-delete'` returns a writer doing `updateOne({ [paths.email]: email }, { $set: { [paths.deleted]: value } }, { runValidators: true })`, where `value` is `deletedValue` — called if it is a function, so a timestamp column gets the time of its own write — defaulting to `true`; `'keep'` returns a no-op resolving `undefined`. Nothing is `$unset` alongside the tombstone: derived unset lists break a required-members subdocument, which is `verifyClear`'s whole reason for being caller-supplied. Reached from [`createVerifyEmailFlow`](./lib-access.md)'s `onAbandon`. |
| `confirmNewEmail` (default) | `(_id: ObjectId, email: string) => Promise<...>` | Finalizes an email-change: `$set`s `login.email` to the new address and `$unset`s every path in `emailChangeClear` — by default `account.email.hash`/`dateLastReq`/`requestTimes`/`newEmailTmp`. |
| `deleteUserByEmail` (default) | `(email: string) => Promise<void>` | Deletes the user document matching `login.email`. Reports `deletedCount === 0` to Sentry (`captureMessage('[deleteUserByEmail] no document matched …', 'warning')`) and resolves anyway — a guard's redirect must not depend on the delete having matched. The `@todo` and the commented-out check it replaced are gone. |
| `enableEmailAccess` | `(_id: ObjectId, email: string) => Promise<void>` | Sets `account.email.valid = true`, `$unset`s every path in `verifyClear` — by default `hash`/`dateLastReq`/`requestTimes` — with `runValidators: true`, then sends the welcome email through its mailer. `createEnableEmailAccess(model, paths, mailer)` takes the mailer as a third parameter (`IVerifyEmailMailer`, [`verifyEmailMailer`](./lib-access.md#verifyemailmailer)); the bound default passes `defaultVerifyEmailMailer`, i.e. SocketLabs. This is the `enableEmailAccess` step in the `routerVerifyEmail` auth-flow cheat sheet. |
| `getResetPwd` | `(session: ClientSession, email: string) => Promise<{ _id, resetDateReq, resetHash, name } \| null>` | Looks up password-reset state (`account.resetDateReq`, `account.resetHash`, `personalData.name`, plus the `account.deleted` / `account.disabled` flags) via a `.lean()` read. Returns `null` for a deleted or disabled account — the same answer an unknown address gets, so `resetPwd` sends nothing and still returns `true`, and `updatePassword` answers the same `403`. The flags are read raw, as in `assertVerifyEmailAllowed`: `.lean()` bypasses Mongoose casting, so an un-migrated `'false'` is a truthy string and blocks the reset (the fix is `scripts/migrate-account-disabled-to-boolean.mjs`, not a coercion here). `resetHash` is populated only when `resetDateReq` is defined **and** the stored hash is a string; any other case yields `null`, never a coerced value and never a fallback to `account.email.hash`. The "reset pending, hash gone" orphan state must fail closed. Returns `null` if no user matches. Note that `resetHash === null` is the ordinary state for any account that has simply never requested a reset, not an error condition — `updatePassword` therefore answers it with the same `403` it gives an unknown address (a `500` there was an enumeration oracle, fixed after 5.1.1) and reports the genuinely malformed records to Sentry instead. |
| `incReqTimes` | `(_id: ObjectId) => Promise<UpdateWriteOpResult>` | `$inc`s `account.email.requestTimes` by 1 (`runValidators: true`). |
| `removeResetReq` (default) | `(session: ClientSession, email: string) => Promise<UpdateWriteOpResult>` | `$unset`s every path in the flow's `resetClear` list, by `email` — by default `account.resetDateReq`/`account.resetHash`, and nothing under `account.email.`. The list is **caller-supplied, not derived** from the pair `saveResetReq` writes: a layout holding the request in one required-members subdocument can only be cleared by unsetting the container, since unsetting a member leaves a document that fails validation and the write is rejected. Passes **no** options object: an email matching no document is a no-op. It used to pass `{ upsert: true }`, which inserted a row keyed by `login.email` instead, and since `updateOne` runs no validators that row satisfied none of the schema's required fields. |
| `saveResetReq` | `(session: ClientSession, _id: Types.ObjectId, now: Date, hash: string) => Promise<void>` | `$set`s `account.resetDateReq = now` and `account.resetHash = hash` (`runValidators: true`). Never writes `account.email.hash`: that slot belongs to the verification flows, and clobbering it here broke pending activation links. Catches errors and rethrows via `throwMongoDBErrors(e as IMongoDBError)`. |
| `setEmailHash` | `(session: ClientSession, userId: Types.ObjectId) => Promise<string>` | Generates a hash via `emailHash()`, `$set`s `account.email.hash`, resets `account.email.requestTimes = 1`, sets `account.email.dateLastReq = now` (`runValidators: true`); returns the generated hash. Carries an `@fixme` comment ("else it goes into exception @fixme check" — verify the failure path throws as expected). |
| `updatePassword` (default, file `updatePasswordDb.mts`) | `(session: ClientSession, _id: mongoose.Types.ObjectId, password: string) => Promise<UpdateWriteOpResult>` | Hashes `password` via `hash(password, SALT_ROUNDS)` and `$set`s `login.password` (`runValidators: true`). Note the default export is named `updatePassword`, not `updatePasswordDb` — the file name and the export name differ. Imported by the public mutation `updatePassword` (`src/graphQL/schema/mutations/updatePassword.mts`). |
| `userData4VerifyEmail` | `(uEmail: string) => Promise<user projection>` | `.lean()` read of `_id`, `account.email.hash/valid/dateLastReq/requestTimes`, `account.deleted/disabled` by `login.email` — the projection is built from the same path map the guard chain reads through, so a field cannot go missing from one and not the other. If no user matches, calls `Sentry.captureMessage` then throws a plain `Error(EMAIL_CHECK_LINK)` (not a GraphQL error). |

## `lib/access/` — verification guard chain (`handleIf*`, `handleBadDB`)

`routerVerifyEmail` no longer calls these guards directly. It fetches the user via `userData4VerifyEmail`, then delegates the whole check to `assertVerifyEmailAllowed(user, email, hash)` (`src/private/lib/access/assertVerifyEmailAllowed.mts`), which is the function that actually calls the guards below in sequence — `handleIfEmailAlreadyValid`, `handleBadDB`, `handleIfTooMuchRequestsTimes`, `handleIfHashBad`, `handleIfMoreThan3DaysPassed`, `handleIfAccountDeleted`, `handleIfAccountDisabled` — and returns the user's `_id` once every guard has passed. The router then calls `enableEmailAccess` on that id. On failure the guards all throw a plain `Error` whose `.message` is a redirect path (`EMAIL_CHECK_LINK = '/x/email-check'`, now `handleBadDB` included) rather than a `GraphQLError`; the router is expected to catch it and redirect using `e.message`. Maintainers adding a new guard must preserve this convention — including the target: a guard with its own redirect path tells an unauthenticated caller which branch it hit.

Every guard that mails does so through an injected `IVerifyEmailMailer` ([`verifyEmailMailer`](./lib-access.md#verifyemailmailer)) rather than constructing `SocketLabsLib` inline, and the bound defaults pass `defaultVerifyEmailMailer` — SocketLabs behind a **15-minute per-address, per-template debounce**. Three of these guards (`handleIfEmailAlreadyValid`, `handleIfAccountDeleted`, `handleIfAccountDisabled`) have no counter of their own and are reachable from an unauthenticated GET, so through 5.6.1 they mailed the address once per request.

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

export interface IAssertVerifyEmailAllowedDeps {
	paths: IVerifyEmailPaths
	handleIfEmailAlreadyValid: THandleIfEmailAlreadyValid
	handleIfHashBad: THandleIfHashBad
	handleIfMoreThan3DaysPassed: THandleIfMoreThan3DaysPassed
	handleIfTooMuchRequestsTimes: THandleIfTooMuchRequestsTimes
	handleIfAccountDeleted: THandleIfAccountDeleted
	handleIfAccountDisabled: THandleIfAccountDisabled
}

export const createAssertVerifyEmailAllowed:
	(deps: IAssertVerifyEmailAllowedDeps) => (user: unknown, email: string, hash: string) => Promise<Types.ObjectId>

export const assertVerifyEmailAllowed: TAssertVerifyEmailAllowed   // UserBase-bound default
```

Runs every guard that must pass before an email-verification link is honored, in order, against the projection `userData4VerifyEmail` returns. `dbHash` passed to `handleIfHashBad` is always the value stored on the account (`paths.hash`, by default `account.email.hash`), never the one supplied in the URL. Enabling the account is deliberately not done here — the caller (`routerVerifyEmail`) does it on the returned id, so that irreversible side effect can't be reordered ahead of a guard.

Since 5.3.0 the document is read through `paths` with `readPath` rather than by fixed property access, and the guards that write to the database are injected — that is what lets the same chain serve any account layout. All six `handleIf*` guards are dependencies now: the three mail-only ones used to be hard imports, each constructing its own SocketLabs client, so no caller could reach those branches without mailing for real. `handleBadDB` stays a direct import — it writes nothing and mails nobody. The guard *order* and the values passed to each are unchanged. `IVerifyEmailUser` is still exported, now purely as documentation of the shape the default paths project; the parameter itself is typed `unknown`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| user | unknown | The projection returned by `userData4VerifyEmail`, read through `paths`. `IVerifyEmailUser` documents its shape under the default paths |
| email | string | The email from the verification URL |
| hash | string | The hash from the verification URL |

**Returns:** `Promise<Types.ObjectId>` — `user._id`, once every guard has passed.

**Throws:** Whatever the first failing guard throws (see the table below).

**Notes:** `user.account.deleted` and `user.account.disabled` are passed to the last two guards **raw**. `userData4VerifyEmail` reads with `.lean()`, so Mongoose casting never runs and these are exactly what the driver found on disk. They are real booleans only once `scripts/migrate-account-disabled-to-boolean.mjs` has been through the database; on un-migrated rows a stored `'false'` is a truthy string and blocks the account. That is deliberate — the flags are not coerced here, because the fix belongs in the data.

| Symbol | Signature | Description |
|---|---|---|
| `handleBadDB` | `(requestTimes?: number, dateLastReq?: Date) => void` | Invariant guard: if either argument is `undefined` (a hash present without `requestTimes`/`dateLastReq` should never happen), logs via `Sentry.captureMessage('[handleBadDB] DB ERROR', 'error')` and throws `Error(EMAIL_CHECK_LINK)`. Through 5.6.1 it threw a hardcoded `'/x/error'` instead, which made a corrupt record on a **real** account distinguishable from an unknown address: the same URL answered `/x/error` for one and `/x/email-check` for the other, an account-existence oracle out of an unauthenticated GET. The distinction is kept in Sentry, where it belongs. |
| `handleIfAccountDeleted` | `(email: string, deleted: boolean = false) => Promise<void>` | If `deleted`, sends `mailer.accountDisabled(email)`, then throws `Error(EMAIL_CHECK_LINK)`. `accountDisabled`, not a deleted-specific template — `SocketLabsLib` has none, and this is what it has always sent. |
| `handleIfAccountDisabled` | `(email: string, disabled: boolean = false) => Promise<void>` | Same pattern as `handleIfAccountDeleted`, gated on `disabled`. |
| `handleIfEmailAlreadyValid` | `(uEmail: string, valid: boolean) => Promise<void>` | If `valid`, sends `mailer.emailAlreadyValid(uEmail)`, then throws `Error(EMAIL_CHECK_LINK)`. Ties into the `signUp` "already valid" email + 409 dual-path behavior documented in `CLAUDE.md`. |
| `handleIfHashBad` | `({ uId, uEmail, hash, requestTimes = 0, dbHash }: IHandleIfHashBadArgs) => Promise<void>` | Single destructured object argument (`IHandleIfHashBadArgs = { uId: mongoose.Types.ObjectId; uEmail: string; hash: string; requestTimes?: number; dbHash?: string }`). If `hash !== dbHash`: increments the stored request counter via `incReqTimes(uId)`, sends `mailer.wrongHash(uEmail, requestTimes + 1)`, then throws `Error(EMAIL_CHECK_LINK)`. |
| `handleIfMoreThan3DaysPassed` | `(uEmail: string, dateLastReq: Date = new Date()) => Promise<void>` | Computes "3 days ago" and compares timestamps via `StringLib.isoToTimestamp`; if `dateLastReq` is older than 3 days, sends `mailer.hashReqTooOld(uEmail)`, **disposes of the account** through the writer it was built with, then throws `Error(EMAIL_CHECK_LINK)`. |
| `handleIfTooMuchRequestsTimes` | `(uEmail: string, requestTimes: number = 99) => Promise<void>` | If `requestTimes >= 5`, sends `mailer.tooMuchVerifyRequests(uEmail)`, **disposes of the account** through the writer it was built with, then throws `Error(EMAIL_CHECK_LINK)`. |

**Import (all rows above):** _internal — not exported_.

**Notes:** every `handleIf*` guard is a factory with a `UserBase`-bound default of the same name. What each takes:

| Factory | Dependencies |
|---|---|
| `createHandleIfHashBad` | `(incReqTimes, mailer)` |
| `createHandleIfMoreThan3DaysPassed` | `(deleteUserByEmail, mailer)` |
| `createHandleIfTooMuchRequestsTimes` | `(deleteUserByEmail, mailer)` |
| `createHandleIfEmailAlreadyValid` | `(mailer)` |
| `createHandleIfAccountDeleted` | `(mailer)` |
| `createHandleIfAccountDisabled` | `(mailer)` |

`handleBadDB` is the only one that is not a factory — it neither writes nor mails. The writer the two disposal guards are built with carries the collection *and* the field paths, so nothing a guard fires touches `user` unless that is the model it was bound to.

`handleIfMoreThan3DaysPassed` and `handleIfTooMuchRequestsTimes` dispose of the account as a side effect of the guard failing, and with the default `onAbandon: 'delete'` there is no recovery path once either fires. Since that writer is whatever [`createVerifyEmailFlow`](./lib-access.md#abandonment-policy--onabandon-deletedvalue-deleteuserbyemail) was given, the guards cannot tell a delete from a tombstone from a no-op — and must not: both still throw regardless, so disposal never decides whether the link is honoured. Do not add a branch here that inspects the policy.

`mailer` is a **required** parameter on all six factories, not optional with a default. These modules are internal, every call site is in this repository, and an optional mailer would let a new caller silently fall back to the process-wide throttle it did not ask for.

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
