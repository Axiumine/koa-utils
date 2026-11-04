# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 8.1.0 — 2026-11-04

A generic PostgreSQL kit under `lib/PostgreSQL/`: 125 new subpaths (284 `exports` keys in all, up from 159), no new peer dependency and no change to any existing export. Nothing in your code changes.

The kit never imports `pg`, `sequelize` or any other peer, at run time or in a `.d.mts`. The database driver is a parameter with a structural type, and the error family, the logger, the counter and the clock are passed in by the caller. `test/package/peerReach.spec.mts` asserts an empty peer budget for every new subpath.

### Added

#### Leaf pieces (39 subpaths)

- Error helpers: `sqlstateOf`, `sqlstateField`, `constraintNameOf`, `errorNameOf` read a driver error defensively and return a value only when it has the expected shape.
- Errors: `DbParseError` (with `DB_PARSE_REASONS`) and `DbConnectError` (with `DB_CONNECT_REASONS`). Neither error ever carries the offending text, the connection string or a password.
- Parsers for the text form of PostgreSQL values: `parseDate`, `parseTime`, `parseTimestamptz`, `parseInt8` (stays a string), `parseUuid` and `arrayOf`. No `Date` object is ever built. Years 1 to 9999 are accepted, `time` is `HH:mm` only, `timestamptz` becomes a UTC ISO string with milliseconds (microseconds are cut toward zero).
- Type registry: `createTypeRegistry` and `TYPE_PARSERS` build a per-pool `types` object from a driver's type table, without touching the driver's global parsers.
- `createPool`: builds a pool from a structural `IDbDriver`, validates the URL, requires the session time zone to be UTC, applies one connect deadline, counts and logs connect failures with the secrets scrubbed, and scrubs the idle-client error log. Constants: `DEFAULT_CONNECT_TIMEOUT_MS`, `DEFAULT_KEEPALIVE_INITIAL_DELAY_MS`, `REQUIRED_SESSION_TIME_ZONE`.
- `databaseUrlReason` with `isValidHost`, `isAbsolutePath` and `LOOPBACK_HOSTS`: validates a database URL against a closed allow-list and returns a reason word, never the URL. The options `expectedRole` and `allowPlainLoopback` replace any environment-name mapping.
- `IDbCounter<TName>`: a generic counter callback type; a counter over a wider name union is assignable to a narrower one.

#### Transactions (24 subpaths)

- `lib/PostgreSQL/tx/withTx`: one transaction wrapper for a node-postgres pool. It opens the transaction with a `BEGIN` taken from a closed table, sets the lock timeout with `SET LOCAL`, runs your function with a handle that has a single `query` method, and commits or rolls back. A failure with SQLSTATE `40001` (serialisation) or `40P01` (deadlock) runs the function again in a fresh transaction, up to `retryMax` times (default 2, at most 10), after a jittered wait. `55P03` (lock timeout) is not retried. When the loop gives up, the error the caller gets is built by the `errors` factory you pass (`errors.internal('TX_RETRY_EXHAUSTED')` or `errors.internal('LOCK_TIMEOUT')`), so the kit imports no error class of your application. Any other error is rethrown unchanged after the rollback.
- The handle closes with the transaction: a statement sent through a kept handle is refused with `DbTxError` (`HANDLE_CLOSED`). A failure that your function swallows is not reported as a success: when the server answers `COMMIT` with the tag `ROLLBACK`, `withTx` throws the first failed statement, or `DbTxError` (`COMMIT_ROLLED_BACK`) when none is known. A connection that emitted an error, or whose rollback failed, is destroyed instead of returned to the pool.
- `lib/PostgreSQL/tx/jitteredDelay` and `defaultRetryDelay` (a full-jitter wait of 0 to 25 ms times two to the power of the retry number minus one), the constants `DEFAULT_LOCK_TIMEOUT_MS` (3000), `MAX_LOCK_TIMEOUT_MS`, `TX_RETRY_MAX`, `TX_RETRY_MAX_CEILING`, `TX_RETRY_BASE_DELAY_MS`, `TX_ISOLATION_LEVELS`, `TX_FAILURE_REASONS`, and the types `ITx`, `ITxResult`, `ITxClient`, `ITxPool`, `ITxOptions`, `ITxIsolation`, `ITxFailureReason`, `ITxCounter`, `ITxCounterName`, `IRetryDelay`. `jitteredDelay` uses `randomInt` from `node:crypto`.
- `lib/PostgreSQL/error/DbTxError` (with `DB_TX_REASONS` and `IDbTxReason`): the closed-reason error of a misused transaction, with a fixed message and no `cause`.
- `lib/PostgreSQL/error/IDbErrorFactory`: the one error-factory port of the kit (`is`, `make`, `internal`). `withTx` reads `internal` only; the other parts of the kit read all three.

#### Error mapping and write guards (19 subpaths)

- `lib/PostgreSQL/error/mapDbError`: turns any thrown value into an error of your own family, built by the `IDbErrorFactory` you pass as `options.errors`. An error the factory recognises passes through unchanged. A `DbParseError`, `DbConnectError`, `DbTxError` or any other SQLSTATE becomes `errors.internal(reason)` with a reason from `DB_INTERNAL_REASONS`. A unique, check or foreign key violation (SQLSTATE 23505, 23514, 23503) is looked up by constraint name in a table you pass as `options.table`, and becomes `errors.make(code, details)`; the details are the ones the row fixes plus the keys the row lists and the caller supplies. An unmapped constraint is `CONSTRAINT_UNMAPPED`. The log line carries the reason, the SQLSTATE, the constraint name and the class name only, never the driver message, `detail`, `query` or `parameters`. Counters: `db_constraint_unmapped_total` and `db_error_internal_total`. The table, the factory and the logger are parameters; the logger needs only an `error` method. A table row whose code means "a defect" is recognised by `options.internalCode` (default `INTERNAL`).
- `lib/PostgreSQL/error/buildConstraintEntry`, `lookupConstraint` and the types `IConstraintEntry`, `IConstraintTable` and `IConstraintEntryBuilder`: the constraint table is plain data owned by the application; the kit ships none. `IConstraintEntryBuilder<TCode, TDetailsByCode>` is a typed view of `buildConstraintEntry` over your own closed list of codes and a map from code to details shape, so a row cannot name a key its code does not have.
- `lib/PostgreSQL/error/DB_INTERNAL_REASONS` and `IDbInternalReason`: the closed reasons that `mapDbError` and `guardVersion` pass to `errors.internal`.
- `lib/PostgreSQL/guard/assertAffected`: throws the error you pass (or a function that builds it) unless a statement affected exactly the expected number of rows; a row count the server did not report is a mismatch. It builds no error and takes no factory.
- `lib/PostgreSQL/guard/guardVersion`: after an update guarded by a `version` or `rev` column matched no row, re-reads the row with the statement you give and answers `errors.make('NOT_FOUND', { entity })`, `errors.make('STALE_VERSION')`, `errors.make('STALE_REV')` or `errors.internal('VERSION_UNCHANGED' | 'REREAD_UNREADABLE')`. An absent row and a row the actor may not see give the same answer. Types: `IVersionGuardInput`, `IVersionGuardField`, `IVersionGuardCode`, `IGuardCounter`, `IAffectedResult`, and `VERSION_GUARD_FIELDS`.

#### Role assertion (9 subpaths)

- `lib/PostgreSQL/role/assertRole`: a boot check that the database role a service is connected as is the one it expects. `assertRole(pool, { expectedRole, expectedGrants, allowedMemberships })` runs fixed, read-only catalog statements on one checked-out connection, in a fixed order, and stops at the first failure: the effective role is `expectedRole`; the role is not a superuser and has no CREATEROLE, CREATEDB, BYPASSRLS or REPLICATION attribute; it owns no object in any database of the cluster; it is a member of no role you did not allow, directly or through a chain; `session_user` is the same role (the login did not `SET ROLE`); and every grant in `expectedGrants` is held (schema, table, view, sequence, function or column level). The expected grants are a parameter, so nothing about your roles is built in. The pool is any object with `connect()` and `end()`, the `pg.Pool` from `createPool` included.
- `lib/PostgreSQL/error/RoleAssertionError` with `ROLE_ASSERT_REASONS` (twelve closed reasons: `INVALID_EXPECTATION`, `ROLE_MISMATCH`, `ROLE_SUPERUSER`, `ROLE_CREATEROLE`, `ROLE_CREATEDB`, `ROLE_BYPASSRLS`, `ROLE_REPLICATION`, `ROLE_OWNS_OBJECTS`, `ROLE_MEMBERSHIP`, `SESSION_ROLE_DIFFERS`, `GRANT_MISSING`, `CHECK_FAILED`), `IRoleAssertionReason` and `IRoleAssertionSubject`. The message is built from names that pass a shape check (anything else prints as `?`, so a connection string given by mistake as a role name is never repeated) and the error has no `cause`.
- Types: `lib/PostgreSQL/role/IAssertRoleOptions`, `IRoleGrant`, `IRolePool`, `IRoleAssertion`.

#### Clock and lock order (34 subpaths)

- `clock/createDbClock`, `clock/lockTaken`, `clock/CLOCK_SQL`, `clock/DB_NOW_SQL` and the types `IClock`, `IDbClock`, `IDbClockOptions`, `IDbClockSeam`. `createDbClock(tx, { write, seam })` binds the server time to a transaction: it is read once, in epoch milliseconds, with `read()` (asynchronous) and then `now()` (synchronous). A write transaction cannot read it before a lock helper has called `lockTaken(tx)`. The optional test seam is a statement you supply plus an `allowed` flag you compute; a seam that is not allowed is refused before the transaction is touched.
- `lock/createLockOrderTracker` and its types `ILockOrderSpec`, `ILockOrderTracker`, `ILockTrackerConfig`, `ILockTrackerOptions`, `ILockAdmission`. You give the tracker a spec (`orders`: the ordered ranks per mode, `helpers`: the rank each of your lock helpers takes in each mode, `defaultMode`); it checks the spec when it is made and answers `admit`, `record`, `track`, `configure`, `hold` and `held`. Its state belongs to the tracker object, so two trackers never share a transaction record.
- `lock/claimRowsSkipLocked`, `lock/lockedRow`, `lock/lockedRows`, `lock/uuidOf`, `lock/uuidsOf`, `lock/rowLockModeOf`, `lock/ROW_LOCK_MODES`, `lock/CLAIM_LIMIT_MAX` and the types `IRowLockMode`, `IClaimRegistry`, `IClaimRequest`. `claimRowsSkipLocked` runs a statement taken from a closed registry that the caller writes; the kit holds no lock clause. The kit exports no raw lock clause and no session-level lock.
- `error/DbClockError`, `error/DB_CLOCK_REASONS`, `error/IDbClockReason`; `error/LockOrderError`, `error/LOCK_ORDER_REASONS`, `error/ILockOrderReason`; `error/DbStateError`, `error/DB_STATE_REASONS`, `error/IDbStateReason`. A lock order violation is one of `RANK_INVERSION`, `MODE_REQUIRED`, `NOT_IN_MODE_ORDER`, `TRACKER_STARTED`; a clock error is one of `WRITE_BEFORE_LOCK`, `NOT_READ`, `ALREADY_BOUND`, `SEAM_REFUSED`, `BAD_RESULT`, `UNSAFE_INSTANT`.

### Security notes

- `assertRole` counts a catalog answer as a pass only when it is exactly what a pass looks like (a boolean `false` flag, one row with a boolean `true`); a malformed answer, a missing object, a `NULL` and a second row are failures, never passes. On any failure the pool is closed before the error is thrown. A connection that emitted an error or failed in the middle of a query is destroyed; one that only failed an assertion goes back to the pool.
- `assertRole` is a boot check with a floor, not a ceiling: it proves the listed grants are held and the dangerous attributes absent, but it does not list privileges the role has beyond your list. See `docs/security.md`, R18 and L15.
- The unit specs run against a fake catalog and pin the exact text of each statement. What the statements do on a real server is not run in this repository: only an integration test against a live PostgreSQL shows it, and you should run one with your own roles if you rely on this check.
- `createPool` scrubs the connection string and the password from its connect-failure log and from the idle-client error log. `DbParseError`, `DbConnectError` and `DbTxError` carry closed reasons and never the offending text, the connection string or a password; `DbTxError` has a fixed message and no `cause`.

### Shared state across copies of the package

The clock slot of a transaction is kept in a frozen registry on `globalThis` under `Symbol.for('@axiumine/koa-utils/postgres-state')`. Two copies of the package in one process (for example through a nested dependency) therefore see the same slot, and a lock taken through one copy is seen by the clock of the other. A copy that finds a value under that key which is not a registry of its own layout throws `DbStateError` with reason `LAYOUT_MISMATCH` while it loads, so two incompatible copies fail at start instead of splitting the state silently. Keep one version of the package installed.

### Docs

`docs/code/lib-postgres.md` is a new page (layout, policies, option tables, "Mapping driver errors", "Write guards", "Clock and locks", "Single copy of the package and shared state"). `docs/security.md` gains the requirements R14 to R20 and the limits L15 and L16.

### Upgrade notes

Nothing to do. The kit is additive: no existing export changes and no peer is added.

## 8.0.0 — 2026-11-04

All peer dependencies are now optional. Nothing in your code changes, but npm 7+ and Yarn no longer install them for you: install what the subpaths you import need.

It also adds two factories with no environment, Sentry or dotenv behind them: `koa/createKoaErrorHandler` and `email/createSocketLabsSender`.

### Breaking

- `@node-rs/bcrypt`, `@sentry/node`, `dotenv`, `graphql`, `mongoose` and `redis` are now optional peers (`uuid` is no longer a peer: tokens use `node:crypto`). Ranges are unchanged. See the matrix in README.md ("Install") for which subpath needs which peer.
- Without `@sentry/node` nothing is reported, and without `dotenv` no environment file is loaded (before, both were installed for you); the subpaths that use them no longer fail at import. Everything else fails with `ERR_MODULE_NOT_FOUND` when its peer is missing, as the optional peers always did.
- `lib/Constants` no longer exports `OBJECTID_0_OBJ` (it pulled `mongoose` into `lib/Constants`, `lib/emailHash`, `lib/checkEmailLen` and `lib/checkPwdLen`). It lives in `lib/OBJECTID_0_OBJ`; the value is the same. New export key: `./lib/OBJECTID_0_OBJ`.

### Added

- **`createKoaErrorHandler`, a Koa error middleware you configure, with no peer dependency.**
  `import { createKoaErrorHandler } from '@axiumine/koa-utils/koa/createKoaErrorHandler'` builds the middleware
  `tdwKoaErrorHandler` always was, but the status, the body and the reporting are yours:

  ```ts
  app.use(
  	createKoaErrorHandler<ParameterizedContext>({
  		statusOf: (err) => (err instanceof SyntaxError ? 400 : 500),
  		bodyOf: (_err, ctx) => ({ code: ctx.status === 400 ? 'BAD_INPUT' : 'INTERNAL' }),
  		report: (err) => console.error('request failed', err)
  	})
  )
  ```

  All four options are optional. The defaults reproduce `tdwKoaErrorHandler` minus GraphQL, Sentry and dotenv:
  `statusOf` is `err?.status || 500` (a status of `0` or `NaN` gives 500), `bodyOf` is `{ message: err?.message }`, there
  is no `report`, and `noBodyStatuses` is `[100, 101, 102, 204, 205, 304]` (replaced, not extended, by a list you pass;
  copied when the handler is created). On a throw the handler sets `ctx.status`, sets `ctx.body` unless the status read
  back from `ctx` is in `noBodyStatuses` or `bodyOf` returned `undefined`, calls `report`, then emits `'error'` on the
  app, all in one synchronous `catch` block, so `emit` listeners see the final `ctx`. The callbacks are not wrapped in
  `try`/`catch`: a throwing `report` rejects the middleware and skips the `emit`, as a throwing Sentry call always did.

  Unlike `tdwKoaErrorHandler`, a thrown `null`, `undefined`, string or number is answered with 500 and
  `{ message: undefined }` instead of a `TypeError`.

  The file imports nothing. Importing it loads no environment file, no Sentry, no `graphql` and no `koa`, in the
  runtime or in the `.d.mts`; `test/package/peerReach.spec.mts` pins that for the three new subpaths.

- Three new `exports` keys: `./koa/createKoaErrorHandler`, `./koa/IKoaErrorHandlerOptions` and
  `./koa/IKoaErrorHandlerContext` (the option and context types). `public-api.json` gains exactly those three.

- **`email/createSocketLabsSender`: a sender for one mail you composed, with no environment, Sentry or dotenv.**
  `createSocketLabsSender({ serverId, apiKey, requestTimeout?, numberOfRetries?, client?, onError? })` returns a
  function `(message) => Promise<{ ok: true } | { ok: false; code: string }>`. A failed send does not reject: it calls
  `onError` with the raw rejection (default: nothing) and resolves `{ ok: false, code }`, where `code` is the SDK's
  `result.name` (`Timeout`, `InvalidAuthentication`, `Warning`, ...) or `'UnknownError'`. Nothing else leaves the
  function: not `responseMessage`, not `addressResults`, not the raw error, which can hold recipients and a receipt.
  The message is `{ from, fromName?, to, subject, text?, html?, messageId? }`; `html` is sent as given.

  Defaults are what `SocketLabsLib` has always used: `requestTimeout` 120 s and `numberOfRetries` 3. A
  `requestTimeout` that is not finite and above 0, or a `numberOfRetries` that is not an integer from 0 to 5, throws a
  `RangeError` when the sender is created (the text never holds the API key). There is no `endpointUrl` and no proxy
  option, and `serverId` and `apiKey` are not validated: the SDK rejects bad credentials at send time. An injected
  `client` (`{ send(message): Promise<unknown> }`) replaces the SDK client and makes `serverId` and `apiKey` unused.
  There is no `try`/`catch`: a throw from a setter, from `client.send` or from `onError` rejects the returned promise.

  The subpath reaches one peer, `@socketlabs/email`, and its `.d.mts` files name none (the SDK ships no types, so the
  options are declared locally). Four type-only subpaths come with it: `email/ISocketLabsSenderOptions`,
  `email/ISocketLabsMessage`, `email/ISocketLabsSendResult` and `email/ISocketLabsClient`. `test/package/peerReach.spec.mts`
  pins all five.

### Changed

- Access and refresh tokens and the temp file names of `files/storeUploadAsTemp` come from `node:crypto` `randomUUID()` instead of `uuid` `v4()`. Same format (lowercase UUID v4), still accepted by `isValidUuidV4`.
- `lib/Constants`, `lib/emailHash` and `lib/tokens` reach no peer at all; `lib/checkEmailLen` and `lib/checkPwdLen` reach only `graphql`. A new spec (`test/package/peerReach.spec.mts`, snapshot `test/__snapshots__/peer-reach.json`) pins which subpath loads which peer, so a later change cannot widen it unnoticed.

- **`tdwKoaErrorHandler` is now a thin wrapper over `createKoaErrorHandler`.** Same file, same `exports` key, same
  name, same two parameters, and no behaviour change: GraphQL status and `description`, the Sentry capture of
  non-GraphQL errors in `NODE_ENV=development` (read on every error), the `TypeError` on a thrown `null` or `undefined`,
  and the `emit('error', err, ctx)` last. It is a plain function that returns the factory's promise instead of an
  `async` function, so it settles in the same number of microtask ticks. The three existing specs pass unchanged, and a
  new parity spec runs a frozen copy of the 7.2.0 algorithm against it over GraphQL and plain errors, in development and
  production.

- `SocketLabsLib` now sends through `createSocketLabsSender`. Behaviour is unchanged: the same `BasicMessage`
  built the same way, the same `Sentry.captureException(rejection, { extra: { detail: 'Error in sending the email' } })`
  with the raw rejection, the same boolean result, and the same `SOCKETLABS_SERVER_ID` / `SOCKETLABS_SERVER_APIKEY`
  reads in the constructor. Its 121-case spec passes unchanged.

### Migration required

If you import a subpath listed in the second column, its peer must be installed. Generated from `test/__snapshots__/peer-reach.json` (159 export keys).

| Peer | Fails with `ERR_MODULE_NOT_FOUND` when missing | Notes |
|---|---|---|
| `@node-rs/bcrypt` | 9 subpath(s): <details><summary>list</summary>`graphQL/schema/mutations/login4Ever`, `graphQL/schema/mutations/loginAdmin`, `graphQL/schema/mutations/loginRememberme`, `graphQL/schema/mutations/signUp`, `graphQL/schema/mutations/updatePassword`, `lib/access/createResetPwdFlow`, `lib/db/registerNewUser`, `lib/encryptPassword`, `lib/hash`</details> |  |
| `@sentry/node` | none | skipped silently when not installed; used by 30 subpath(s) |
| `@socketlabs/email` | 14 subpath(s): <details><summary>list</summary>`email/SocketLabsLib`, `email/createSocketLabsSender`, `graphQL/schema/mutations/emailChangeHashVerify`, `graphQL/schema/mutations/login4Ever`, `graphQL/schema/mutations/loginAdmin`, `graphQL/schema/mutations/loginRememberme`, `graphQL/schema/mutations/resetPwd`, `graphQL/schema/mutations/signUp`, `graphQL/schema/mutations/updatePassword`, `koa/router/verifyEmail`, `lib/access/createResetPwdFlow`, `lib/access/createVerifyEmailFlow`, `lib/access/resetPwdMailer`, `lib/access/verifyEmailMailer`</details> |  |
| `clamscan` | 3 subpath(s): <details><summary>list</summary>`files/scanVirus`, `files/uploadTempImage`, `files/uploadTempPdf`</details> |  |
| `dotenv` | none | skipped silently when not installed; used by 25 subpath(s) |
| `file-type` | none | fails at first call, not at import; used by 5 subpath(s) |
| `fs-extra` | 10 subpath(s): <details><summary>list</summary>`files/moveFileStaticDomain`, `files/moveImageFile`, `files/moveTempFile`, `files/uploadTempImage`, `files/uploadTempPdf`, `files/validateJpgPngExtension`, `files/validateJpgPngMimeType`, `files/validateMimeType`, `files/validateMimeTypeImages`, `files/validatePdfExtension`</details> |  |
| `graphql` | 72 subpath(s): <details><summary>list</summary>`email/SocketLabsLib`, `files/reEncodeToJpeg`, `files/reEncodeToPng`, `files/reEncodeToWebp`, `files/uploadTempImage`, `graphQL/schema/GraphQLInput/GraphQLInputLogin`, `graphQL/schema/mutations/emailChangeHashVerify`, `graphQL/schema/mutations/login4Ever`, `graphQL/schema/mutations/loginAdmin`, `graphQL/schema/mutations/loginRememberme`, `graphQL/schema/mutations/logout`, `graphQL/schema/mutations/refresh`, `graphQL/schema/mutations/resetPwd`, `graphQL/schema/mutations/signUp`, `graphQL/schema/mutations/updatePassword`, `graphQL/schema/types/DeleteType`, `graphQL/schema/types/DoneType`, `graphQL/schema/types/FindOneAndUpdateType`, `graphQL/schema/types/LoginAppType`, `graphQL/schema/types/LoginType`, `graphQL/schema/types/MidNameType`, `graphQL/schema/types/OnlyIdType`, `graphQL/schema/types/RefreshType`, `graphQL/schema/types/RetStatusMexType`, `graphQL/schema/types/RetStatusType`, `graphQL/schema/types/SaveType`, `graphQL/schema/types/SidNameType`, `graphQL/schema/types/SidNomeType`, `graphQL/schema/types/UpdateResultType`, `graphQL/throw/throwAccessTokenExpiredOrDeleted`, `graphQL/throw/throwAccessTokenRequired`, `graphQL/throw/throwAlreadyDone`, `graphQL/throw/throwAlreadyTakenError`, `graphQL/throw/throwConflictError`, `graphQL/throw/throwErrorWrongUserInput`, `graphQL/throw/throwForbiddenError`, `graphQL/throw/throwGoneError`, `graphQL/throw/throwGraphQLError`, `graphQL/throw/throwInternalError`, `graphQL/throw/throwMethodNotAllowedError`, `graphQL/throw/throwMissingMalformedInvalidToken`, `graphQL/throw/throwNotAcceptableError`, `graphQL/throw/throwNotFoundError`, `graphQL/throw/throwNotImplementedError`, `graphQL/throw/throwPaymentRequiredError`, `graphQL/throw/throwPreconditionFailedNoAuthCookie`, `graphQL/throw/throwPreconditionFailedNoAuthHeader`, `graphQL/throw/throwRefreshTokenExpiredOrDeleted`, `graphQL/throw/throwRefreshTokenRequired`, `graphQL/throw/throwRefreshTokenSignatureRequired`, `graphQL/throw/throwTooManyRequestsError`, `graphQL/throw/throwUnauthorizedError`, `graphQL/throw/throwUnprocessableContentError`, `graphQL/throw/throwUnsupportedMediaTypeError`, `koa/customFormatErrorFn`, `koa/middleware/authenticatedAuthorizationHandler`, `koa/middleware/authenticatedAuthorizationHandler/verifySignedRefreshToken`, `koa/middleware/authenticatedLogoutHandler`, `koa/middleware/authenticatedResourceHandler`, `koa/router/verifyEmail`, `koa/tdwKoaErrorHandler`, `lib/MariaDB/throwSqlErrors`, `lib/MongoDB/throwIfMongoErr`, `lib/MongoDB/throwMongoErrors`, `lib/access/createResetPwdFlow`, `lib/access/createVerifyEmailFlow`, `lib/access/resetPwdMailer`, `lib/access/verifyEmailMailer`, `lib/checkEmailLen`, `lib/checkPwdLen`, `lib/throwIfNotValidEnumValue`, `lib/tryCatchRethrow`</details> |  |
| `keygrip` | none | types only: `koa/middleware/authenticatedAuthorizationHandler`, `koa/middleware/authenticatedAuthorizationHandler/verifySignedRefreshToken`, `koa/middleware/authenticatedLogoutHandler` |
| `koa` | none | types only: `koa/logRequestToDb`, `koa/middleware/authenticatedAuthorizationHandler`, `koa/middleware/authenticatedLogoutHandler`, `koa/middleware/authenticatedResourceHandler`, `koa/middleware/debug`, `koa/tdwKoaErrorHandler` |
| `mariadb` | none (loaded by name, or by another peer) | |
| `mongoose` | 25 subpath(s): <details><summary>list</summary>`dataSources/MongoDB`, `graphQL/models/MongoDB/UserBase`, `graphQL/models/MongoDB/log/DevStatsGraphQLCalls`, `graphQL/models/MongoDB/log/LogGlobalError`, `graphQL/models/MongoDB/log/LogStatsGraphql`, `graphQL/models/MongoDB/log/LogThrow`, `graphQL/schema/mutations/emailChangeHashVerify`, `graphQL/schema/mutations/login4Ever`, `graphQL/schema/mutations/loginAdmin`, `graphQL/schema/mutations/loginRememberme`, `graphQL/schema/mutations/resetPwd`, `graphQL/schema/mutations/signUp`, `graphQL/schema/mutations/updatePassword`, `koa/middleware/authenticatedAuthorizationHandler`, `koa/middleware/authenticatedResourceHandler`, `koa/router/verifyEmail`, `lib/OBJECTID_0_OBJ`, `lib/access/createResetPwdFlow`, `lib/access/createVerifyEmailFlow`, `lib/db/log/hitStat`, `lib/db/log/logGlobalError`, `lib/db/log/logGraphql`, `lib/db/log/logThrow`, `lib/db/registerNewUser`, `lib/db/userExist`</details> | types only: `graphQL/schema/context/IContextAuthenticatedResource`, `graphQL/schema/context/IContextRefresh`, `graphQL/schema/interfaces/IFindAndUpdate`, `graphQL/schema/mutations/refresh`, `koa/middleware/authenticatedAuthorizationHandler/verifySignedRefreshToken`, `koa/middleware/debug`, `lib/access/accessPaths` |
| `pg` | 1 subpath(s): <details><summary>list</summary>`dataSources/PostgreSQL`</details> |  |
| `redis` | 9 subpath(s): <details><summary>list</summary>`dataSources/Redis`, `graphQL/schema/mutations/login4Ever`, `graphQL/schema/mutations/loginAdmin`, `graphQL/schema/mutations/loginRememberme`, `graphQL/schema/mutations/logout`, `graphQL/schema/mutations/refresh`, `koa/middleware/authenticatedAuthorizationHandler`, `koa/middleware/authenticatedLogoutHandler`, `koa/middleware/authenticatedResourceHandler`</details> |  |
| `reflect-metadata` | none (loaded by name, or by another peer) | |
| `sequelize` | none (loaded by name, or by another peer) | |
| `sequelize-typescript` | 1 subpath(s): <details><summary>list</summary>`dataSources/MariaDB`</details> |  |
| `sharp` | 4 subpath(s): <details><summary>list</summary>`files/reEncodeToJpeg`, `files/reEncodeToPng`, `files/reEncodeToWebp`, `files/uploadTempImage`</details> |  |

## 7.2.0 — 2026-11-01

Email links are now built only on an `http(s)` base, and a failed welcome mail can no longer break an activation that
already succeeded. One effect is visible from outside: a deployment whose `APP_DOMAIN` is unset, empty or has no scheme
gets an HTTP 500 on every send that carries a link (see below), where it used to mail a dead link.

No exported symbol, public method signature, `package.json` `exports` key or peer range changes. This is the second
release published through `release.yml`, with the same provenance bundle as 7.1.1.

### Security

- **A link base that is not an `http(s)` URL is refused instead of being placed in an email link.** 7.1.1 HTML-escaped
  `linkBase` but did not look at its scheme, so a per-call `linkBase` of `javascript:...`, `data:...`, `vbscript:...` or
  a scheme-relative `//host` was emitted as the target of the link in the HTML part. The same held for `APP_DOMAIN`,
  which every other link in `SocketLabsLib` is built on.

  The check runs on the URL the WHATWG parser returns, not on a string prefix, so `JaVaScRiPt:`, ` javascript:` and
  `java<TAB>script:` are caught like `javascript:`. A base passes only if it parses to `http:` or `https:`, has no user
  name or password (`https://good@evil.example` goes to `evil.example`), and holds no control character, whitespace or
  backslash (the parser would strip or rewrite them, and the base is emitted as written). A valid base is used exactly
  as given, so every mail sent before is byte-for-byte the same.

  A refused base makes the send reject with the existing `throwInternalError()` (HTTP 500, title `Internal Server
  Error`, description `Error reported to Dev Team.`); nothing is built or sent. It covers the `linkBase` argument of
  `sendEmailVerify` and `sendEmailReset` (and `createResetPwdMailer`), and `APP_DOMAIN` for `sendEmailChangeVerify`,
  `sendWelcome`, `sendSubscriptionEmail`, `sendResetPwdConfirmation` and `sendResetPwdConfirmationHash`. `APP_DOMAIN` is
  checked when a link is built, not in the constructor, so `new SocketLabsLib()` still succeeds.

  Observable change: a deployment whose `APP_DOMAIN` is unset, empty or has no scheme (`example.com`) used to mail a
  link that went nowhere (`undefined/check/...`); it now gets the 500 on every send that carries a link. Set
  `APP_DOMAIN` to `https://your.host`. No exported symbol, signature or `package.json` `exports` key changes. Limit L11
  of `docs/security.md` is narrowed to the header and footer fragments.

  The welcome mail of the email-verification link is the one send that does not surface this 500. `sendWelcome` used to
  be unable to reject (the send helper swallows transport errors and returns `false`), and `enableEmailAccess` calls it
  after the account is already activated and the link spent. A rejection there would have redirected the user to
  `/x/error` for an activation that worked, with no link left to retry. `enableEmailAccess` now catches a rejection or
  throw from the mailer, reports it to Sentry and resolves, as `updatePassword` does for its confirmation mail; the
  verification link still redirects to `/x/registration-done` and only the welcome mail is lost. An error from the
  database write itself still rejects.

## 7.1.1 — 2026-10-31

Three weaknesses fixed, one of them a documented limit. Secret hashes were compared with `===`, `StringLib.cleanHtml`
used a quadratic regex, and `SocketLabsLib` put caller-supplied values into email HTML without escaping them.

No exported symbol, public method signature, `package.json` `exports` key or peer range changes. One effect is visible
from outside: the HTML part of the library's emails now carries escaped text (see below). If you escaped values
yourself, as limit L11 advised through 7.1.0, stop: `name`, `err`, the OTP, the ids, the subject, `PLATFORM_NAME` and the
per-call `linkBase` are now escaped by the library, so your escaping would be applied twice.

### Security

- **Secret hash comparisons are now constant-time.** The reset hash in `updatePassword`, the activation hash in
  `handleIfHashBad` and the email-change hash in `emailChangeHashVerify` were compared with `===` / `!==`, which returns
  at the first differing character, so response time could reveal how much of a guessed hash was right. They now go
  through an internal helper that hashes both sides with SHA-256 and compares the digests with `crypto.timingSafeEqual`.

  There is no observable behaviour change besides timing: a wrong or missing hash still answers 403 (`updatePassword`)
  or bumps the strike counter and mails the warning (activation, email change), and a right hash still passes. A
  missing stored hash never matches, even against a missing input. The
  hashes carry 250 bits from `crypto.randomBytes`, so guessing one is not feasible even with a timing signal; this
  closes the side channel as defence in depth. `updatePassword` still has no strike counter.

- **`StringLib.cleanHtml` and `cleanHtmlUndefined` no longer use a quadratic regex (ReDoS, CWE-1333).** On input with
  many `<` and no `>` the old regex took about 1.9 s for 80,000 characters. They now use a linear scanner. The output is
  identical to the old regex for every string, non-string input still throws `TypeError` as before, and the public
  signatures are unchanged.

- **`SocketLabsLib` HTML-escapes every value it places in an email's HTML part.** This closes known limit L11 of
  `docs/security.md`, where `name`, the `err` of `alertDevTeam`, the OTP, the ids of `sendEmailPostReported`, the
  platform name, the subject in `<title>` and the title of `getHtmlHeader` went into the HTML unescaped. `&`, `<`, `>`,
  `"` and `'` are escaped by one helper; links are escaped as `href` values and as link text. The plain-text part and
  the subject line are unchanged.

  ⚠️ Observable change, HTML part only: a name, message, code or link containing `&`, `<`, `>`, `"` or `'` now appears
  escaped in the HTML source (mail clients render it as typed). For example the legacy reset link of
  `sendResetPwdConfirmationHash` reads `&amp;hash=` and `&amp;email=` in the `href` and in the link text.
  `getHtmlHeader(title)` now escapes `title`, and so does `PLATFORM_NAME`: pass plain text, not pre-escaped text. L11
  stays open only for what you configure: the constructor header and footer fragments are still inserted as given, and
  `linkBase` is escaped for HTML but its scheme and target are not validated.

### Internal

- New private modules, none of them exported: `private/lib/access/safeEqualSecret`, `assertResetAllowed` and
  `applyPasswordReset` (the reset checks and transaction body moved out of `updatePassword`),
  `private/lib/access/emailChangeHandlers` (the lookup and branch handlers of `emailChangeHashVerify`), and
  `private/email/*` (the `SocketLabsLib` copy builders and the one `escapeHtml` helper). `SocketLabsLib` is now a thin
  dispatcher. The moves keep the order of checks and side effects, the error responses and the Sentry messages as they
  were. The TypeScript-`private` members of `SocketLabsLib` (`fixName`, `htmlHeader1`, `htmlHeader2`, `sendEmail`,
  `StringObj`) are gone from the class and its `.d.mts`, and the `mailer` option of `resetPwd` is now typed
  `IResetPwdMailer | undefined` (a widening). Specs pin the constant-time compare at each call site.

- Quality gates added since 7.1.0, all dev-only: code-size caps, an ESLint suppression ratchet, FTA complexity scores,
  Knip, type-coverage, and Stryker mutation testing with a 100% score gate. The FTA cap is now 50 (it was 64). The
  unused `tsx` devDependency was removed.

## 7.1.0 — 2026-08-28

The Redis connection scheme is now configurable. `dataSources/Redis` hard-coded `redis://` for cluster root nodes and
passed `REDIS_URL` to `createClient` unexamined, so a deployment that wanted TLS had no supported way to ask for it and
no way to notice when it silently did not get it. The new `REDIS_TLS` flag makes the choice explicit and, once enabled,
refuses to start on a plaintext URL rather than downgrading quietly.

The flag is opt-in and off by default: with `REDIS_TLS` unset the client behaves byte-for-byte as it did in 7.0.0, so
this release needs no configuration change.

### Added

- **`REDIS_TLS` — require TLS for the Redis connection.** Enabled only by the exact string `true`; unset, empty, `1`,
  `TRUE` and `yes` are all read as off. The match is deliberately exact, because `Boolean(process.env.REDIS_TLS)` would
  read a stored `false` as true and `!== 'false'` would read an unset variable as true — both force TLS on a deployment
  whose operator never asked for it.

  | `REDIS_TLS` | Single client (`REDIS_URL`) | Cluster (`REDIS_IS_CLUSTER=1`) |
  | --- | --- | --- |
  | unset / anything but `true` | `REDIS_URL` passed through untouched | root nodes `redis://host:port`, `defaults.socket.tls` false |
  | `true` | `REDIS_URL` must use the `rediss:` scheme, or module load throws | root nodes `rediss://host:port`, `defaults.socket.tls` true |

  With the flag on, a non-`rediss://` `REDIS_URL` throws at import time, before a socket is opened:

  ```
  [Redis] REDIS_TLS is enabled but REDIS_URL is not set — a rediss:// URL is required.
  [Redis] REDIS_TLS is enabled but REDIS_URL is not a valid URL — a rediss:// URL is required.
  [Redis] REDIS_TLS is enabled but REDIS_URL uses scheme "redis:" — rediss:// required.
  ```

  It fails closed rather than rewriting `redis://` to `rediss://`. A silent upgrade would hide the misconfiguration
  until the TLS handshake failed, against a host that may not be the intended one; refusing at startup turns it into a
  single unmissable error. The scheme is compared through `new URL().protocol`, the same way node-redis compares it, so
  an upper-case `REDISS://cache:6379` is accepted.

### Changed

- **Cluster mode now sets `defaults.socket` as well as the root-node scheme.** node-redis uses `rootNodes` only to
  discover the cluster topology and does not inherit their socket configuration for the connections it then opens to
  the discovered nodes, so a `rediss://` scheme on `rootNodes` alone would have left every real cluster connection on
  plaintext. `defaults.socket` is `{ tls: true }` when the flag is on and `{ tls: false }` otherwise, which is what
  node-redis already defaulted to — no behaviour change with the flag off.

### Internal

- Three new private modules back the flag, none of them exported: `private/dataSources/isRedisTlsRequired` (the single
  `process.env` read, evaluated per call so the ESM module cache cannot freeze it), `private/dataSources/redisNodeUrl`
  (one cluster root-node URL) and `private/dataSources/resolveRedisUrl` (the standalone-client gate). The scheme
  decision lives in `redisNodeUrl` rather than inline in `Redis.mts` because the whole `createCluster` arm is excluded
  from coverage — inlining it would have parked that arm's one security-relevant decision outside the 100% gate.

## 7.0.0 — 2026-08-14

`src/files/uploadTempImage.mts` shipped a function whose name did not match its own file or its `package.json` export
key: the module `./files/uploadTempImage` exported `uploadTemp`. Every other uploader in the package follows the
file-name convention (`uploadTempPdf.mts` exports `uploadTempPdf`), and the mismatch was carried in `REPO.md` and
`docs/code/files.md` as a standing note readers had to be warned about. This release makes the name match the file.

It is a major bump because renaming an exported symbol breaks every consumer importing the old binding, even though
nothing about the upload pipeline's behaviour changed.

### Breaking

- **`@axiumine/koa-utils/files/uploadTempImage` now exports `uploadTempImage`, not `uploadTemp`.**

  The export key (`./files/uploadTempImage`), the signature `(img: Promise<IFileUpload>) => Promise<IUploadTemp>`, the
  pipeline steps and the thrown `Error('Error storing image')` are all unchanged, so the only edit a consumer needs is
  the imported binding:

  ```ts
  // 6.0.0
  import { uploadTemp } from '@axiumine/koa-utils/files/uploadTempImage'
  // 7.0.0
  import { uploadTempImage } from '@axiumine/koa-utils/files/uploadTempImage'
  ```

  No alias is kept under the old name. A consumer that upgrades without renaming reads `undefined` off the module —
  TypeScript catches it at build time, but a plain-JS consumer only fails when the upload is actually called, not at
  import time.

### Changed

- CI only, no effect on the published package. `.github/workflows/qodana.yml` passes the linter to
  `JetBrains/qodana-action` as `--linter jetbrains/qodana-js:2026.2` instead of
  `--linter,jetbrains/qodana-js:2026.2`. The action deprecated the comma-separated `args` format and warns that it will
  be removed in a future version; the linter itself is unchanged and still matches `linter:` in `qodana.yaml`, which is
  what `.githooks/pre-commit` reads.

- CI only, no effect on the published package. `actions/checkout` and `actions/setup-node` bumped from `v4` to `v5`.
  Both `v4` majors declare `runs.using: node20`, which GitHub is retiring on its runners, so the runner was forcing them
  onto Node 24 and warning on every run; `v5` is the first major of each that declares `node24` natively. This is the
  runtime of the actions themselves — `node-version: 24` for the build and the `engines` requirement for consumers are
  unrelated and unchanged.

## 6.0.0 — 2026-08-11

`verifyIntrospectionCode` had no environment gate. The comparison itself was sound — `timingSafeEqual`, fails closed on
an unset or empty `INTROSPECTION_CODE` — but nothing stopped it running in production, so the `x-introspectioncode`
header skipped authentication under **every** `NODE_ENV`. A leaked or guessed `INTROSPECTION_CODE` was a full
authentication bypass on three middlewares against a live database.

This release is a major bump because closing that hole is, by construction, a behaviour break: deployments that relied
on the bypass outside development stop being able to use it.

### Security

- The `x-introspectioncode` bypass is now refused unless `process.env.NODE_ENV` is exactly `'development'` or `'test'`.

  The check is the **first** statement of `verifyIntrospectionCode`, before `INTROSPECTION_CODE` is read at all — a
  correctly configured secret and a byte-for-byte correct header still return `false` in any other environment. It sits
  inside `verifyIntrospectionCode` rather than in the three middlewares that call it (`authenticatedResourceHandler`,
  `authenticatedLogoutHandler`, `authenticatedAuthorizationHandler`), so no direct caller of the primitive can reach an
  ungated comparison.

  ⚠️ The gate is an **allowlist**, not `NODE_ENV !== 'production'`. The two forms differ only on unrecognised values,
  and the negated form fails *open* on exactly the inputs most likely to be wrong: an unset or empty `NODE_ENV` is the
  ordinary failure of a container runtime, and `'Production'`, `'prod'` and `'staging'` are the ordinary failures of a
  deploy script. Under the allowlist a mislabelled environment loses a development convenience; under the denylist it
  opens authentication in production, silently. Do not "simplify" it to the negated form.

### Added

- New export `@axiumine/koa-utils/lib/isIntrospectionBypassAllowed`, carrying `isIntrospectionBypassAllowed()`.

  The gate as a standalone predicate — no arguments, returns `true` only under `NODE_ENV` `'development'` or `'test'`.
  Consumers were already maintaining their own copy of exactly this condition; the bypass is only coherent while the
  library and the app agree on which environments may use it, so it is published rather than kept internal.
  `verifyIntrospectionCode` calls it instead of repeating the comparison.

### Breaking

- **`x-introspectioncode` no longer authenticates anything outside `NODE_ENV=development` and `NODE_ENV=test`.**

  Concretely, these `NODE_ENV` values stopped working and now refuse the header even when `INTROSPECTION_CODE` is set
  and the header matches it:

  | `NODE_ENV` | 5.9.0 | 6.0.0 |
  |---|---|---|
  | `development` | bypass honoured | bypass honoured |
  | `test` | bypass honoured | bypass honoured |
  | `production` | bypass honoured | **refused** |
  | `staging` (or any other custom name) | bypass honoured | **refused** |
  | unset | bypass honoured | **refused** |
  | `''` (empty) | bypass honoured | **refused** |
  | `Production`, `PRODUCTION`, `prod` | bypass honoured | **refused** |
  | `Development`, `TEST`, `Test` (case variants) | bypass honoured | **refused** |

  The failure is the ordinary unauthenticated one for each middleware, not a new error: `498 Invalid Token` from
  `authenticatedResourceHandler` and `authenticatedAuthorizationHandler`, `412 Precondition Failed` from
  `authenticatedLogoutHandler`.

  **Unset `NODE_ENV` is the migration hazard, not `production`.** A container image that never exports `NODE_ENV` reads
  as "not on the allowlist", so a service that used the bypass in an environment nobody thought of as production loses
  it at upgrade. Fix it by setting `NODE_ENV=development` (or `test`) where the bypass is genuinely wanted — not by
  widening the allowlist.

  If a service needs privileged access in production, that is an authentication problem and needs a credential, not a
  header that skips the check.

## 5.9.0 — 2026-08-05

The same problem 5.8.0 fixed for the verification link, now for the reset link. Additive throughout — every existing
caller keeps the behaviour it had — but it takes three signatures to reach the place where the choice can be made.

`sendEmailReset` built its link from `APP_DOMAIN`, read once in the `SocketLabsLib` constructor. One process serving two
front-ends therefore mailed every account the same host: a customer asking for a password reset was sent to the operator
panel, which cannot complete the reset. Fixing only `sendEmailVerify` would have been worse than fixing neither — an
account that confirmed its address on one front-end and then reset its password on another would have been sent to two
different sites for two halves of the same login.

### Added

- `SocketLabsLib.sendEmailReset` takes two new optional parameters, `linkBase` and `linkPath`, appended after `name`:

  ```ts
  sendEmailReset(emailTo, hash, name = '', linkBase = this.linkBase, linkPath = '/x/reset')
  ```

  Both default to the previous behaviour exactly — `linkBase` to the constructor's `APP_DOMAIN` read, `linkPath` to the
  hardcoded `/x/reset` — and the same normalisation `sendEmailVerify` got applies: a trailing slash on `linkBase` and a
  missing leading slash on `linkPath` are stripped before the join.

  ⚠️ Unlike the verification link, this one is consumed by a **front-end route**, not by a backend router: the page reads
  the email and the hash out of its own path and calls `updatePassword`. `linkPath` therefore names a route in whatever
  app `linkBase` serves and has to agree with that app's router rather than with a service mount point. Nothing on the
  server fails loudly when it does not — only a person following a dead link ever finds out.

- New export `@axiumine/koa-utils/lib/access/resetPwdMailer`, carrying `IResetPwdMailer`, `socketLabsResetPwdMailer` and
  `createResetPwdMailer(linkBase?, linkPath?)`.

  `IResetPwdMailer` has one method, `sendEmailReset(email, hash, name)`, and is structural, so `SocketLabsLib` itself
  satisfies it and a test double is an object literal. One method looks like ceremony next to `IVerifyEmailMailer`'s six
  and is not: this is the flow's only message. There is deliberately no throttle wrapper to match `throttleMailer` —
  `resetPwd` already enforces a 10-minute per-account throttle before it reaches the send, and the amplification the
  verify-email debounce exists for arrives through an unauthenticated GET this flow has no equivalent of.

  Both arguments of `createResetPwdMailer` are optional so a caller can pass `process.env.SOMETHING` straight through: an
  unset variable arrives as `undefined` and the default takes over, whereas normalising it to `''` at the call site would
  build a link with no host at all.

- `createResetPwdMutation` takes an optional `mailer` in `IResetPwdDeps`, defaulting to `socketLabsResetPwdMailer`, and
  `createResetPwdFlow` takes an optional `mailer` in `ICreateResetPwdFlowArgs` and forwards it.

  The host is not derivable inside the resolver — by the time `resetPwd` holds an email and a hash, two collections
  behind one service look identical, and nothing in the account says which front-end it belongs to. So the choice moves
  up to where the collection is already chosen, through the same seam `createVerifyEmailFlow` already exposes for its own
  notifications. Per-flow is the right granularity: the collection and the front-end that serves it are the same choice
  made twice.

  ```ts
  const customer = createResetPwdFlow({
  	model: Customer,
  	mailer: createResetPwdMailer('https://shop.example.com', '/account/new-password')
  })
  ```

  `updatePassword` is untouched — its confirmation mail carries no link.

- `deploy-local.sh`, maintainer tooling rather than part of the package. It builds, then rsyncs `dist/` into every
  consumer's `node_modules/@axiumine/koa-utils` inside one workspace, so an unpublished version can be exercised against
  the real services first. `npm publish` is a one-way door; this is not a release step.

## 5.8.0 — 2026-08-04

### Added

- `SocketLabsLib.sendEmailVerify` takes two new optional parameters, `linkBase` and `linkPath`, appended after `name`:

  ```ts
  sendEmailVerify(emailTo, hash, name = '', linkBase = this.linkBase, linkPath = '/check/verify-email')
  ```

  They default to the previous behaviour exactly — `linkBase` to the constructor's `APP_DOMAIN` read, `linkPath` to the
  hardcoded `/check/verify-email` — so this is additive and no existing call site changes. `signUp`, the library's only
  internal caller, still passes two arguments.

  The reason is that every other link this class builds is fixed at construction, which is correct while a deployment has
  a single front-end and wrong the moment a second one registers accounts through the same backend. A platform with a
  customer site next to an operator panel has two confirmation domains and one `APP_DOMAIN`; before this change the only
  ways to send both were a second process or mutating `process.env` between sends. Passing the base per call is the
  smallest thing that makes both links expressible. `linkPath` comes with it because two audiences usually also mean two
  routes on the receiving service, and a distinct path removes the ambiguity that a shared one would push onto a reverse
  proxy.

  A trailing slash on `linkBase` and a missing leading slash on `linkPath` are normalised away before the join. The
  caller supplies configuration, not a pre-joined URL, and `//check` or `example.comcheck` are not failures worth
  surfacing to a user in the middle of registration.

## 5.7.2 — 2026-08-01

Packaging metadata only, as 5.7.1 was. No file under `src/` changed and the published `dist/` is unchanged.

### Fixed

- The `graphql` and `redis` peer ranges introduced in 5.7.1 excluded the current release of both packages. They were
  written as `"graphql": "<17"` and `"redis": "<6"`, but `graphql` is on 17.x and `redis` on 6.x on npm — the bound
  landed one major too low in each case. Both are required peers, so a consumer already holding `graphql@17` or
  `redis@6` got `has incorrect peer dependency` on Yarn 1 and an outright `ERESOLVE` install failure on npm 7+. The
  ranges are now `"graphql": "<18"` and `"redis": "<7"`.

  The bound is raised on evidence, not to silence the error: the package was built and its full suite run against
  `graphql@17.0.2` and `redis@6.2.0` — 786 tests passing at 100% statements, branches, functions and lines. The API
  surface this library touches is eight type constructors from `graphql` and `createClient` / `createCluster` from
  `redis`, and none of it moved across either major.

  The mistake was deriving each upper bound from the version pinned in `devDependencies` rather than from what is
  actually published. That reads correctly for a peer whose latest release matches the pinned major and silently
  produces an off-by-one-major bound for every peer whose ecosystem has moved on. The other seventeen ranges were
  re-checked against the registry and all admit their current release.

## 5.7.1 — 2026-08-01

Packaging metadata only. No file under `src/` changed and the published `dist/` is unchanged, so no runtime behaviour moves.

Every peer dependency was declared hard, with an empty `peerDependenciesMeta`. A service that imports only the auth
mutations was therefore told it had unmet peers for `sharp`, `clamscan`, `pg` and the Sequelize stack — packages its
import graph never reaches — and on npm 7+, which installs missing peers instead of warning about them, that same
declaration pulls all of it into `node_modules`. The warnings were noise, and noise is what makes a consumer stop
reading the real ones.

### Fixed

- Twelve of the peers are now `optional` in `peerDependenciesMeta`: `@socketlabs/email`, `clamscan`, `file-type`,
  `fs-extra`, `keygrip`, `koa`, `mariadb`, `pg`, `reflect-metadata`, `sequelize`, `sequelize-typescript` and `sharp`.
  There is no barrel export — the `exports` map has 148 explicit subpaths and no `"."` — so each of these is reachable
  only through subpaths the consumer opts into by importing them. Of the 148, 104 load a package at all; the other 44
  are type-only declarations or dependency-free logic. `sharp` is reached by 4 of the 104, `pg` and
  `sequelize-typescript` by 1 each; `file-type` is loaded with `await import()` and reached by none statically.
  `keygrip` and `koa` survive only in the `.d.mts` declarations, erased from every emitted `.mjs`.

  `@node-rs/bcrypt`, `@sentry/node`, `dotenv`, `graphql`, `mongoose`, `redis` and `uuid` stay required. Strictly, no
  peer is reached by every dependency-bearing subpath — `graphql` has the widest reach at 71 of 104 — so "required"
  here means the auth core reaches them, not that importing any subpath does. npm resolves peers per package, not per
  subpath, so which seven are hard is a policy call about what a real consumer of this library installs anyway.

  Optionality is a claim about the load path. It stays true only while the dependency sits behind an opt-in subpath:
  adding a root `"."` barrel, or importing one of the twelve from a module every subpath reaches, silently converts it
  back into a hard requirement for everyone. `.d.mts` files carry the same boundary — a consumer importing
  `dataSources/PostgreSQL` under `skipLibCheck: false` still needs `pg` installed to typecheck.

- Every version range was `*` except `keygrip`. `sharp` 0.34 → 1.0 would have installed silently and failed at runtime
  with no warning at all, and the same held for every other peer's next major. Each range now carries an upper bound at
  the major after the one this package is built against — `"sharp": "<1"`, `"mongoose": "<10"`, `"redis": "<6"` — and
  `keygrip` keeps the `^1.1.0` it already had.

  The bound is deliberately one-sided. `*` was unbounded in both directions and only the upper end ever caused the
  defect; adding a floor would assert a minimum this package has never tested and would hand a working consumer a
  `has incorrect peer dependency` warning, or an npm 7+ `ERESOLVE` failure, for a combination that was fine yesterday.
  No consumer on any currently published major sees a new warning from this release.

  That last sentence was wrong for `graphql` and `redis`, whose bounds were set a major too low. Corrected in 5.7.2.

### Removed

- Source maps no longer ship in the npm tarball. `files: ["dist"]` published every `.mjs.map` the build emits, and
  `tsconfig.json` sets `"inlineSources": true`, so each map carried the complete original `.mts` — comments, `@todo`s
  and all — as `sourcesContent`. That was 190 files and 363 kB, a third of the unpacked payload, and it published the
  source of `src/private/**`, which is deliberately absent from the `exports` map. `files` now negates
  `dist/**/*.mjs.map` and `dist/**/*.js.map`; the tarball drops from 573 files to 383.

  The build is unchanged, so `yarn build` still writes maps into `dist/` with sources inlined and local debugging with
  `--enable-source-maps` keeps working. Only the publish surface narrows.

### Added

- `koa` and `mariadb` joined `peerDependencies`, both optional. Both were already used and neither was declared:
  `koa`'s `Next` type appears in six modules under `src/koa/` and reaches the emitted declarations, and
  `dataSources/MariaDB` configures Sequelize with `dialect: 'mariadb'`, which loads the driver package from the
  consuming project at connect time.

## 5.7.0 — 2026-07-26

The email-verification chain, reported from a consumer binding `createVerifyEmailFlow` to a non-`UserBase` model, plus
the repository tooling and npm metadata that was already sitting here. Additive throughout — every existing call site
keeps its signature — with two behaviour changes on paths reachable without authentication: guard notifications are now
debounced, and `handleBadDB` answers the same redirect as every other guard.

### Added

- `createVerifyEmailFlow` takes an abandonment policy. Two guards dispose of a pending registration — the fifth wrong
  hash and a link older than 3 days — and until now both meant `deleteOne`, with no way to change it: overriding
  `flow.deleteUserByEmail` after the fact did nothing, because the guards closed over the internal writer. That is fatal
  for a row other collections depend on, and mongo has no cascade to fall back on.

  ```ts
  createVerifyEmailFlow({ model: Imprenditore, onAbandon: 'soft-delete', deletedValue: () => new Date() })
  createVerifyEmailFlow({ model: Imprenditore, deleteUserByEmail: myCascadingWriter })
  ```

  `onAbandon: 'delete'` (the default) is the old behaviour; `'soft-delete'` `$set`s `paths.deleted` and leaves the row;
  `'keep'` is a no-op. `deletedValue` defaults to `true` for `UserBase`'s boolean column and is otherwise written
  verbatim — a function is called once per write, so a `Date` column gets the time of its own. `deleteUserByEmail`
  replaces the writer outright and wins over both. Whatever the policy, both guards still throw: disposal never decides
  whether the link is honoured. The factory builds exactly one writer, uses it in the guards and returns it, so
  `flow.deleteUserByEmail` now reports the policy rather than pretending to set it.

- `IVerifyEmailMailer` (`lib/access/verifyEmailMailer`) — the six notifications the chain sends, as an interface, with
  `socketLabsVerifyEmailMailer`, `throttleMailer(mailer, throttle)` and `defaultVerifyEmailMailer`. Every guard used to
  construct its own `SocketLabsLib` inline, which pinned every consumer to this package's provider, copy and
  `SOCKETLABS_*` env vars, and left no branch of the chain drivable from an integration suite: with real credentials in
  `.env` the only paths reachable without mailing a real person were "address not found" and the bad-DB guard — the
  success path included, since `enableEmailAccess` sent the welcome mail itself. All six `handleIf*` guards,
  `enableEmailAccess` and the `emailChangeHashVerify` mutation now take the mailer as a dependency, and
  `createVerifyEmailFlow` accepts `mailer`. The interface is structural, so `SocketLabsLib` itself satisfies it.

  `handleIfAccountDeleted` still sends `accountDisabled`: there is no `accountDeleted` template, and that is what it has
  always sent. Documented rather than changed — the copy is a product decision.

- `createMailThrottle` / `ALWAYS_MAIL` (`lib/access/createMailThrottle`) — in-process debounce behind the mailer, one
  send per key per window, keyed `` `${template}:${address}` ``. Default 15 minutes, `maxKeys` 5000 with expired-first
  sweeping and oldest-key eviction so cycling addresses cannot grow the map or mute a real one. `TMailThrottle` is a
  single function so a deployment can swap in a Redis `SET key NX PX`; `ALWAYS_MAIL` restores the old behaviour.

- `.githooks/pre-commit` runs Qodana after the coverage gate, on the same commits that already trigger
  `yarn test:coverage`. Until now Qodana ran only in CI, on push to `main` — which is *after* `yarn upload` has
  published, since the publish is a local manual step running beside CI rather than behind it. That ordering is how
  5.6.0 shipped: the scan went red roughly three minutes after the broken tarball was already public. The gate is the
  same one either way (`qodana.yaml`: `severityThresholds` critical 0 / high 0, `testCoverageThresholds` 100/100).

  The hook invokes docker directly rather than `yarn qodana`, which would re-run the whole suite a second time, and it
  reads the linter tag out of `qodana.yaml` so bumping `linter:` cannot leave it scanning an older image than CI.

  It never pulls: auto-pulling is what produced the misleading red on the 5.6.1 CI run, where Docker Hub timed out,
  `qodana-action` fell through to `--skip-pull`, no container started, and the "failure" carried no verdict at all.
  Every missing prerequisite — docker, daemon, `qodana.yaml`, its `linter:` key, `.env`, `QODANA_TOKEN`, the image
  itself — blocks the commit and prints the one command that fixes it. `docker pull` stays the developer's command.
  Bypass is `SKIP_QODANA=1 git commit`, narrower than `--no-verify` in that it keeps the coverage and lockfile gates.

### Security

- **Unauthenticated mail amplification in the verify-email route.** `handleIfEmailAlreadyValid`,
  `handleIfAccountDeleted` and `handleIfAccountDisabled` mailed the address on *every* request and had no counter to
  lean on — unlike the wrong-hash and expiry guards, which at least advance `requestTimes`. Anyone who knew a registered
  address could hold `GET /check/verify-email/<address>/<anything>` open in a loop and make the platform's own SocketLabs
  account mail its owner once per request: a mail bomb aimed at a third party, and a sending-reputation problem for the
  platform. All five guard notifications are now debounced per address per template (default 15 minutes) and
  `emailChangeHashVerify` shares the window; `sendWelcome` is not debounced, being on the success path only. Opt out with
  `mailThrottle: ALWAYS_MAIL`, or replace the window with a cross-instance one.

- **Account-existence oracle in `handleBadDB`.** It threw a hardcoded `'/x/error'` where every sibling guard throws
  `EMAIL_CHECK_LINK` (`'/x/email-check'`), so a corrupt record on a **real** account and an unknown address answered the
  same unauthenticated URL with two different redirects. It now throws `EMAIL_CHECK_LINK` like the rest; the distinction
  is kept where it is useful and not disclosed, in the existing `Sentry.captureMessage('[handleBadDB] DB ERROR')`.
  Consumers relying on `/x/error` from this branch should watch Sentry instead.

### Fixed

- `deleteUserByEmail` reports `deletedCount === 0` to Sentry (`captureMessage(…, 'warning')`) instead of carrying a
  `// @todo report on Sentry` comment above a commented-out check. It still resolves — a guard's redirect must not
  depend on the delete having matched — but a disposal that silently hit nothing is no longer invisible.

### Changed

- Every published version carrying a defect fixed by a later release is now deprecated on npm: `4.0.1`–`5.0.3` (reset
  completable without the hash; reset token sharing `account.email.hash`), `5.1.0`–`5.1.1` (account-enumeration
  oracles; missing `requestTimes` projection), `5.2.0`–`5.3.0` (reset flow accepting deleted and disabled accounts),
  `5.6.0` (swallowed upload error), and — as of this release — `5.4.0`, `5.4.1`, `5.5.0` and `5.6.1`, which carry the
  two security defects fixed here: the unauthenticated mail amplification and the `handleBadDB` existence oracle. Those
  four were deliberately left alone until now, superseded but with nothing known wrong; the guard chain has been
  mailing on every request since long before them, so that no longer holds. Each message names its defect and points
  at 5.7.0. Semver ranges already move anyone who re-resolves; deprecation exists to reach exact pins and stale
  lockfiles, so it is spent on real defects rather than on being merely out of date.

  The messages on `4.0.1`–`5.3.0` still read "Upgrade to 5.6.1", which is itself deprecated now. Left as-is
  deliberately: they name the worse defect, and a consumer following them lands on a version whose own message points
  the rest of the way.

## 5.6.1 — 2026-07-25

Fixes one line that 5.6.0's log cleanup deleted by mistake. No signature or export change.

### Fixed

- `uploadTemp` (`src/files/uploadTempImage.mts`) logs its caught error again. The 5.6.0 sweep removed
  `console.error('Error storing image:', e)` along with the `console.debug` calls it was supposed to target, which
  left `catch (e)` binding an error nobody read: the original failure from `validateJpgPngExtension`,
  `validateJpgPngMimeType`, `scanVirus` or `reEncodeToWebp` was discarded and replaced by the generic
  `Error('Error storing image')` with no trace anywhere. Qodana caught it as
  `'e' is defined but never used (@typescript-eslint/no-unused-vars)`. The matching line in `uploadTempPdf.mts` was
  never affected, and `docs/code/files.md` had described the intended behaviour correctly all along.

## 5.6.0 — 2026-07-25

Log cleanup across `src/`. No export keys added or removed and no signature changed, so nothing breaks at compile
time — but two middlewares stop producing output, so read the note below before upgrading if you rely on their logs.

### Removed

- Every `console.debug` call is gone from `src/`, and so is every commented-out `console.*` line (36 of them, spread
  over 26 files). `console.info`, `console.error` and `console.log` are untouched: connection tracing in
  `src/dataSources/**`, ClamScan reporting in `src/files/scanVirus.mts` and the upload-helper error logs all still
  work as before.
- `logRequestToDb` no longer logs or times anything — it awaits `next()` and returns. The request timing, the
  `ctx.state.user?.id` lookup and the `OBJECTID_0_OBJ` import went with the two log lines. The export and its
  signature are unchanged, so it stays wired in harmlessly; consumers who want per-request logs must add their own
  middleware.
- `debugHandler` is now an inert pass-through: its four `console.debug` lines (timestamp, request headers, cookie
  header, `refresh_token` cookie) were the whole body. Same export, same signature, no output.
- `registerNewUser` no longer dumps the constructed user document — that line printed the bcrypt password hash and
  the activation hash to stdout on every signup.
- `DateLib.minElapsed` is side-effect free; it printed three lines on every call, including from the
  password-reset throttle path.

### Changed

- `src/files/checkForNSFW.mts` is still one commented-out block, but the `console.debug` / `console.error` calls
  inside it are now plain comments carrying the same text. The file remains disabled and holds no executable code.
- `src/files/scanVirus.mts` lost the empty `else` branch left behind when its commented log line was removed.

## 5.5.0 — 2026-07-25

Dependency cleanup only: no new export keys, no runtime signature changes, no behaviour change and no migration.

### Removed

- `koa-logger` is no longer declared as a peer dependency. Nothing under `src/` has ever imported it — it was a
  required peer (there is no `peerDependenciesMeta` block, so every peer is mandatory), which meant each consumer had
  to install a package this library never loads. It is also dropped from `devDependencies`, the README install
  command and the `REPO.md` peer list. Consumers who use `koa-logger` in their own application must now depend on it
  directly instead of picking it up through this package's peer set.

## 5.4.1 — 2026-07-25

Internal quality-gate work only: no new export keys, no runtime signature changes, no behaviour change and no
migration. Consumers are unaffected.

### Changed

- The `emailChangeHashVerify` and `updatePassword` resolvers were split into module-private helpers to stay within the
  repo's eslint `max-lines-per-function` (50) and `max-params` (4) budgets, which the model-agnostic refactor had
  pushed them past. Qodana surfaces those warnings as High, so the gate had gone red. `emailChangeHashVerify` now
  delegates its matched- and mismatched-hash branches to `handleValidHash` and `handleHashMismatch`, both taking one
  bundled context object; `updatePassword` moves its transaction body into `applyPasswordReset`. The exported
  mutations, their argument interfaces and their `Promise<boolean>` results are unchanged, and coverage stays at 100%.

### Fixed

- The `scripts/migrate-account-disabled-to-boolean.mjs` usage example no longer inlines a `user:pass@` MongoDB URI,
  which Qodana's "Password in URL" rule reported as a hardcoded password (a Critical finding). The example now shows a
  credential-free URI and points at `MONGO_URI` for authentication; no code path changed.

## 5.4.0 — 2026-07-22

Security release, plus a declaration-emit fix that unblocks re-exporting this package's mutations from a consumer's own
entry point. No new export keys, no runtime signature changes and no migration. The password-reset pair changes its
observable behaviour for deleted and disabled accounts — see the consumer note below.

### Security

- The password-reset flow now refuses deleted and disabled accounts. `IResetPwdPaths` gains `deleted` and `disabled`,
  defaulting to `account.deleted` and `account.disabled` — the same two slots `IVerifyEmailPaths` has carried since the
  flow was written, and the same ones `assertVerifyEmailAllowed` guards on the verification side. `getResetPwd` projects
  both and returns `null` when either is set, so both mutations inherit the gate from the single reader they share.

  Until now the interface had no slot for the flags, so `resetPwd` and `updatePassword` structurally could not branch on
  account state and neither ever looked. `UserBase` has no pre-hook or query middleware filtering tombstoned documents
  either, so the read returned them like any other. `resetPwd` mailed a live reset link to an address whose account was
  deleted or locked out; `updatePassword` then accepted that link and overwrote the account's bcrypt hash. The second
  half is the part that outlives the block: re-enabling the account later hands it back with a password the requester
  chose while it was disabled. A consumer that gates disabled and deleted accounts at login — the common arrangement,
  and the reason this is easy to miss — is protected from the session but not from the stale hash.

  `null` is what the reader already returns for an address that is not registered, so the answer callers see is the one
  an unknown address gets: `resetPwd` returns `true` and sends nothing, `updatePassword` throws `throwForbiddenError()`.
  Both are byte-identical to the unknown-address answers 5.2.0 settled on, so the gate opens no new enumeration oracle.

  Both flags are read raw, exactly as `assertVerifyEmailAllowed` reads them. This is a `.lean()` read, so Mongoose
  casting never runs and the value is whatever the driver found: a boolean once
  `scripts/migrate-account-disabled-to-boolean.mjs` has run. On un-migrated data a stored `'false'` is a truthy string
  and blocks the reset — the fix is the migration, not a coercion at the call site, matching the decision taken for the
  verification flow.

  **Consumer note:** `createResetPwdFlow` takes `paths` as a `Partial`, so the two new keys are additive for every
  consumer that passes overrides — no change is required. Only a full object literal annotated `: IResetPwdPaths`
  needs the keys added. A layout with no equivalent of these flags can point them at a path that does not exist, which
  reads `undefined` and opts out silently; do that deliberately, not by omission.

### Fixed

- Nine modules exported a type that their public API already referenced but that consumers could not name, so a
  consumer re-exporting any of them failed declaration emit with `TS4023: Exported variable … has or is using name …
  from external module … but cannot be named`. The trigger is any new binding whose type must be inferred — a bound
  factory call, or the plain `export const fields = { signUp, loginAdmin, … }` object a root `Mutation` type is
  assembled from — which is why this surfaced in ordinary schema assembly rather than in exotic code.

  The seven access and login mutations each declared their own module-private `IArgs`. They are now exported **and**
  renamed, one distinct name per module: `ISignUpArgs`, `ILoginAdminArgs`, `ILoginRemembermeArgs`, `ILogin4EverArgs`,
  `IResetPwdArgs`, `IUpdatePasswordArgs`, `IEmailChangeHashVerifyArgs`. Exporting alone would not have been enough —
  seven identical `IArgs` names collide the moment a consumer imports two of them into the same schema file, which is
  exactly where they are needed.

  Two more instances sat outside the mutation directory and behind their own export keys: `IGlobalError`
  (`lib/db/log/logGlobalError`) and `IStatsGraphqlSchema` (`graphQL/models/MongoDB/log/LogStatsGraphql`), the latter the
  generic argument of the exported model. Both are now exported; the docs describing them as module-private were wrong
  and are corrected.

  **Consumer note:** purely additive type surface. None of these names were reachable before, so no import can break,
  and no runtime behaviour changes. A consumer that worked around this with an explicit annotation on the export — a
  hand-written `TResetPwdMutation` or similar — can drop it. Export keys stay at 146.

### Tests

- Verified by declaration emit rather than by inspection: a throwaway consumer project (`NodeNext`, `declaration: true`,
  `emitDeclarationOnly`) re-exporting all 146 `package.json` subpaths against `dist/` reproduced every one of the nine
  failures and now compiles clean. The sweep is what found the two instances outside the mutation directory; a targeted
  grep for `interface IArgs` does not reach them.
- `getResetPwd` gains a projection-completeness test asserting the `.select()` string covers all six paths it reads,
  and three account-state cases: deleted alone, disabled alone with `deleted: false` explicit so only the second arm of
  the `||` can be the cause, and both flags explicitly `false` served normally.
- `createResetPwdFlow` drives the gate end to end on the alien layout — no link for a deleted account, none for a
  disabled one, and `updatePassword` refusing both states while holding a valid unexpired hash. `accessPaths` asserts
  the two new defaults point at the same slots the verification flow guards.
- 731 → 739 tests across the same 123 spec files. Coverage stays 100% on statements, branches, functions and lines, per
  file.

### Documentation

- `docs/code/lib-access.md` gains an "account-state gate" section covering the pre-fix behaviour, why `null` opens no
  oracle, the raw-read/migration rule and the opt-out; the `IResetPwdPaths` table and the example `paths` gain both
  keys, as does the `README.md` access-flows snippet.
- `docs/code/internal.md` records the widened `getResetPwd` projection and its `null` answer for a blocked account.
- `docs/code/graphql-mutations.md` renames all seven argument interfaces in its snippets, names them in the intro with
  the `TS4023` message they resolve, and links both reset mutations to the gate section.
- `docs/code/graphql-models.md` and `docs/code/lib-db.md` drop the claims that `IStatsGraphqlSchema` and `IGlobalError`
  are module-private and not part of the public surface.

## 5.3.0 — 2026-07-22

Additive release. The password-reset and email-verification flows are no longer bound to the `UserBase` model, but every
existing export keeps its name, its signature and its behaviour: upgrading from 5.2.0 is a drop-in, with no migration.

### Added

- `createResetPwdFlow({ model, paths })` and `createVerifyEmailFlow({ model, paths })` build the two access flows against
  any Mongoose model. `UserBase` pins `collection: 'user'` and a fixed field layout (`login.email`, `login.password`,
  `account.resetHash`, `account.email.*`), and every helper underneath the two flows hard-coded those paths — so a
  consumer whose accounts live in another collection, or under another field tree, could not use `resetPwd`,
  `updatePassword` or the verify-email chain at all. Nothing threw: the queries simply matched no document and the whole
  flow silently no-oped.

  `createResetPwdFlow` returns `{ resetPwd, updatePassword }`, ready to drop into a schema's `Mutation` fields.
  `createVerifyEmailFlow` returns the whole chain — `userData4VerifyEmail`, `setEmailHash`, `enableEmailAccess`,
  `confirmNewEmail`, `deleteUserByEmail`, `incReqTimes`, `assertVerifyEmailAllowed`, `emailChangeHashVerify` and
  `routerVerifyEmail` — bound to the same model and path map, so the five-strike account delete and the 3-day link expiry
  act on the caller's collection rather than on `user`.

- `accessPaths` exports the two path maps, their defaults and their resolvers: `IResetPwdPaths`,
  `DEFAULT_RESET_PWD_PATHS`, `resolveResetPwdPaths`, `IVerifyEmailPaths`, `DEFAULT_VERIFY_EMAIL_PATHS`,
  `resolveVerifyEmailPaths` and `TAccessModel`. Both default maps are `Object.freeze`d, lists included, so one consumer
  cannot mutate the defaults of another. `paths` is a `Partial` merged over the defaults — pass only the keys that
  differ, since a key present with an explicit `undefined` overrides the default *with* `undefined`.

- `resetClear`, `verifyClear` and `emailChangeClear` are caller-supplied lists of paths to `$unset`, deliberately **not**
  derived from the leaf paths the flow reads. A layout that stores the request as one all-or-nothing subdocument —
  `resetPwd: { resetDateReq: Date, resetHash: String }`, both members required whenever the container exists — under
  `validationLevel: 'strict'` / `validationAction: 'error'` rejects a write that unsets a single member, because the
  leftover document fails validation. The only legal cleanup there is `$unset: { resetPwd: '' }`, one container path
  rather than two leaf paths. A flat layout never hits this, so a derived list would look correct and would make the
  strict layout impossible to express.

- Three export keys: `./lib/access/createResetPwdFlow`, `./lib/access/createVerifyEmailFlow` and
  `./lib/access/accessPaths`. 143 → 146.

### Changed

- Every helper under `src/private/lib/access/**` is now `createXxx(model, paths)`, and the three access mutations and the
  Koa router take their collaborators as injected dependencies. Each module still exports a `UserBase`-bound default
  under its original name, built by applying its own factory at module load — there is no second code path, so a
  behaviour change made in one is made in both. Under the default maps, the projection strings the flows build are
  byte-identical to the hand-written ones they replace.
- `assertVerifyEmailAllowed` is built by `createAssertVerifyEmailAllowed({ paths, handleIfHashBad,
  handleIfMoreThan3DaysPassed, handleIfTooMuchRequestsTimes })` and reads the account document through dotted paths
  rather than through the `IVerifyEmailUser` shape. The exported guard keeps its `(user, email, hash) =>
  Promise<ObjectId>` signature and its order of checks.

### Tests

- `src/koa/router/verifyEmail.mts` no longer carries `/* c8 ignore start/stop */`. The block existed because the
  handler's first statement was an ESM live binding sinon cannot replace, so the entire `try` body was dead code in the
  suite while the file still reported 100%. With the collaborators injected, all three paths — activation, rejecting
  guard, failing write — are exercised directly, and the ignore is deleted rather than moved.
- New specs drive both factories end to end against a fake model with a deliberately alien layout (`mail`, `pwd`,
  `profile.fullName`, `resetPwd.*`, `verification.*`, `verified`), asserting the filter, the projection string and the
  exact update document — including that `resetClear: ['resetPwd']` produces `$unset: { resetPwd: '' }` and not two leaf
  unsets.
- 119 → 123 spec files, 682 → 731 tests. Coverage stays 100% on statements, branches, functions and lines, per file.

### Documentation

- New `docs/code/lib-access.md` documents both factories, both path maps key by key, and the `resetClear` rationale. It
  is indexed from `docs/code/README.md`, and `CLAUDE.md` gains the matching `src/lib/access/**` row in its doc map.
- `docs/code/internal.md`, `graphql-mutations.md` and `koa-middleware.md` describe the factory signatures and the
  injected dependencies; `README.md` gains an "Access flows on your own model" section; `REPO.md` lists the new files.

## 5.2.0 — 2026-07-22

Security release. Closes two account-enumeration oracles in the password-reset pair. No signature changes and no
migration, but the observable error behaviour of both mutations changes — see the consumer notes below.

### Security

- `updatePassword` no longer answers `500` when the stored record carries no usable `resetHash`. `getResetPwd` returns
  `resetHash === null` for every account whose `account.resetDateReq` is undefined, which is nearly the entire user
  base at any given moment. Paired with the `403` given to an address that is not registered at all, that made the
  mutation a plain enumeration oracle: unauthenticated, unthrottled, one address per request, and with no timing
  difference to hide behind because neither path reaches bcrypt. Send any hash, read the status code, learn whether the
  address has an account. Both cases — and the `resetDateReq === null` guard next to them — now throw
  `throwForbiddenError()`, identical in status, title and description to the unknown-address answer and to the existing
  hash-mismatch and expired-link answers. The orphan-record signal that used to travel as a `500` now goes to Sentry as
  a `captureMessage`, so a malformed record is still reported, just not to the caller.

  **Consumer note:** do not branch on `500` vs `403` from this mutation. Every pre-write rejection is now `403`; `500`
  means the password write itself failed.

- `resetPwd` no longer throws `429 Too Many Requests` when a reset was already requested less than 10 minutes ago. That
  answer could only ever reach a caller whose address was both registered and mid-reset, while an unknown address got
  `true` — the same oracle in a smaller window. The 10-minute throttle is unchanged and still enforced: no new hash is
  written and no email is sent. Only the disclosure is gone, so a throttled request is now byte-identical to a request
  for an address that does not exist.

  **Consumer note:** a "please wait N minutes" branch in the UI has nothing left to trigger it and should be removed.
  `throwTooManyRequestsError` is still exported and unchanged; it simply has no caller left inside this package.

- `resetPwd` now sends the reset-link email **after** the transaction commits and **without awaiting it**, where it
  used to `await` the send inside the `withTransaction` callback. Removing the 429 alone would have left the same fact
  readable off the clock: awaiting a network round-trip to SocketLabs made the response measurably slower in exactly
  the "registered and not throttled" case. What is left in the awaited path is one extra `updateOne`, about a
  millisecond against internet jitter an order of magnitude larger, and the 10-minute throttle caps an attacker at one
  sample per address, so there is no noise to average away.

  The move fixes two further defects that were not about timing at all:
  - `session.withTransaction` re-runs its callback on a transient error. With the send inside, a retried commit mailed
    the user a second link, and the second `saveResetReq` invalidated the first one they may already have clicked.
  - A SocketLabs outage propagated out of the transaction as a `500` — once more, an answer only a registered address
    could ever receive. The caller now always sees `true`.

  Accepted costs: a delivery failure is reported to Sentry (`captureException`) and nowhere else, and mail in flight is
  lost if the process is killed before the request settles. A synchronous throw on that path, including from the
  `SocketLabsLib` constructor, is caught and reported the same way rather than escaping the resolver.

  **Consumer note:** the hash is committed before the send is attempted, so a failed send still arms the 10-minute
  throttle — the user gets no link and a retry inside the window does nothing. Undoing the write from the failure
  handler was considered and rejected: a rejected promise does not prove non-delivery, and a timeout after SocketLabs
  accepted the message would kill a link already sitting in the user's inbox.

### Fixed

- `updatePassword` sends its "your password was changed" confirmation **after** the transaction commits, not inside the
  `withTransaction` callback. Same retry defect as `resetPwd`: mongoose re-runs the callback on a transient error, so a
  retried commit mailed the user a second notice — indistinguishable, from the user's side, from someone else resetting
  the account again. The send is still `await`ed, unlike `resetPwd`'s: reaching that line requires a valid reset hash,
  so there is no timing oracle to close.

  A delivery failure no longer fails the request either. It used to abort the transaction and answer `500`, rolling
  back the new password and `removeResetReq` with it. Consistent, but it made the mail provider a hard dependency of
  the operation: while SocketLabs was down, no user could complete a password reset at all, however healthy the
  database was. The failure now goes to Sentry and the caller gets `true`, because by then the password really has
  changed.

  Restoring the abort is not available after the move, which is why the failure is swallowed rather than rethrown:
  once the transaction has committed there is nothing to abort. Rethrowing would report `500` for a password that is
  already live, and compensating would mean writing back the previous bcrypt hash, which this flow never reads. Putting
  the send back inside the callback returns both the duplicate notice and the reverse inconsistency — mail delivered,
  commit then fails, user told about a change that never happened. Unlike `resetPwd`'s link, this message carries
  nothing the user needs in order to act.

  **Consumer note:** a `200`/`true` from `updatePassword` no longer implies the confirmation email went out.

### Tests

- `test/graphQL/schema/mutations/updatePassword.spec.mts` and `resetPwd.spec.mts` each gained a test that runs the two
  indistinguishable cases back to back and asserts the answers match, rather than only asserting each one separately.
  A future change that reintroduces a distinct status for the "registered but nothing pending" case fails there.
- `resetPwd`'s "endSession is called in finally" test used to drive the 429 path, which no longer throws. It now makes
  the `saveResetReq` write reject, so the session-leak guard still runs against a real throwing path.
- `resetPwd.spec.mts` pins the detached send from four directions: a send that never settles must not hold up the
  resolver (re-adding the `await` times the test out rather than passing it), a rejected send and a synchronous throw
  must both still answer `true`, and a `withTransaction` stub that runs its callback twice must produce two writes but
  exactly one email.
- `updatePassword.spec.mts` pins the same retry invariant on the confirmation email — callback twice, four writes, one
  email — and that a rejected send still answers `true`.

## 5.1.1 — 2026-07-22

Security release. No API change and no migration: upgrading from 5.1.0 is a drop-in. Two defects the 100% coverage
gate could not see, for the same underlying reason — the specs stubbed the database call, so the test decided the
answer the driver would have given. One projected too few fields, one wrote where it should have no-oped.

### Security

- `emailChangeHashVerify` now projects `account.email.requestTimes`. It was missing from the `.select(...)`, and since
  the query is `.lean()`, a field left out of the projection is simply absent on the returned object — so the
  hash-mismatch path always hit `typeof requestTimes === 'undefined'` and threw `500`. Three consequences, all fixed by
  adding the field:
  - `incReqTimes` was never reached, so the strike counter that `handleIfTooMuchRequestsTimes` uses never advanced. An
    attacker could guess the change-email hash without ever accumulating a strike.
  - `SocketLabsLib.wrongHash` was never sent, so the account owner was never warned that someone was guessing.
  - A wrong hash answered `500` while an unknown address answered `false`, which told an unauthenticated caller that a
    given address had an email change pending.

  The `typeof requestTimes === 'undefined'` guard stays, and is now what it was always meant to be: a defensive branch
  for a stored record that has a hash but no counter.

### Fixed

- `removeResetReq` no longer passes `{ upsert: true }`. Clearing the reset state of an email that matches no document
  did not no-op — MongoDB inserted a row keyed by `login.email`, and because `updateOne` runs no validators that row
  satisfied none of the schema's required fields (`login.password`, `account.email.valid`, `account.registrationDate`),
  leaving a junk user document behind. No caller could reach it today (`updatePassword` only calls it once the reset
  record has been read back), so nothing observable changes; the option was a trap waiting for the next caller. The
  spec now asserts `updateOne` is called with exactly two arguments, so any option object reintroduced later fails
  there.
- `test/graphQL/schema/mutations/emailChangeHashVerify.spec.mts` records the projection handed to `.select(...)` and
  asserts it covers every field the resolver reads. The bug above survived a green 100% gate because the `findOne` stub
  discarded the projection argument and returned a hand-built document that always carried `requestTimes` — the stub
  decided the document's shape, so the document could never disagree with the projection.

## 5.1.0 — 2026-07-22

Security release, and the first one that needs a data migration. Two defects, both in how account state is stored:
the password-reset token shared a field with the email-verification hash, and `account.disabled` was declared as a
string while every consumer treated it as a boolean. Neither is an API change — `IUserBaseSchema.account` only gains
an optional `resetHash` — but **run `scripts/migrate-account-disabled-to-boolean.mjs` before deploying** if the
database was ever written by 5.0.3 or earlier. See "Migration required" below.

### Security

- The password-reset token now lives in its own schema field, `account.resetHash`. It previously shared
  `account.email.hash` with signup activation and email-change, two flows with a different lifetime (3 days vs 60
  minutes), a different throttle (`account.email.requestTimes` vs a 10-minute window) and a different trust domain —
  proving control of an inbox versus authorising a password change. Two consequences, both closed by the split:
  - A hash minted by either flow was accepted by the other. An activation link already sitting in the user's inbox
    could set a new password, and a reset link could validate an email address.
  - `resetPwd` is unauthenticated, so one call for any known address overwrote a pending activation or email-change
    hash and silently broke the link already sent. Every click on the dead link incremented
    `account.email.requestTimes`, and at 5 `handleIfTooMuchRequestsTimes` deletes the account.

  `saveResetReq` writes `account.resetHash`, `removeResetReq` unsets it, and `getResetPwd` projects and reads it. There
  is deliberately no fallback to `account.email.hash` — reading the verification slot is the defect itself.

- `account.disabled` is now `type: Boolean` in `UserBaseSchema` and `UserAdminKoaUtilsSchema`, matching the
  `boolean` both TypeScript interfaces always declared. It was `type: String`, which did not merely mistype the field —
  it inverted it. Mongoose casts on write and on hydrated reads, so a stored boolean `false` came back as the string
  `'false'`, which is truthy, and every consumer tests the flag with a bare `if (account.disabled)`. `infoUserForLogin`
  and `infoUserAdminForLogin` read with `.exec()`, so `_finalizeLoginCheck` refused login with `403` and sent an
  "account disabled" email to a user explicitly marked **not** disabled. Writing `false` back through Mongoose stored
  the string too, so the flag could not be cleared through the models at all — only an absent field behaved. The
  library never writes `disabled` itself, which is why this stayed latent: operators only ever wrote `true`.

### Changed

- **Breaking for in-flight resets.** Reset links issued before the upgrade point at a hash stored in
  `account.email.hash`, which the new `getResetPwd` does not read; they fail with a 500 and the user must request a new
  one. The window is bounded by the 60-minute reset expiry, so it closes an hour after deploy. Rows carrying a stale
  `account.email.hash` from a reset need no migration: the verification flows overwrite that field on their next
  request.
- `IUserBaseSchema.account` gains `resetHash?: string`. Additive — consumers constructing the object literally are
  unaffected.

### Migration required

Applies to anyone upgrading from **5.0.3 or earlier** — every version up to and including `v5.0.3` declared
`account.disabled` as `{ type: String }`, so any database those versions wrote can hold `'true'`/`'false'` strings in
that field. A database only ever written by a fixed version needs nothing; running the script anyway is safe and
idempotent, since it only touches fields whose stored `$type` is `string`.

- **`scripts/migrate-account-disabled-to-boolean.mjs` — run once per database before deploying.** The schema change
  above repairs hydrated reads, not stored data, and `.lean()` readers (`userData4VerifyEmail`,
  `emailChangeHashVerify`) bypass Mongoose casting entirely: on un-migrated rows they still see `'false'` and still
  block the account. The code reads these flags raw and deliberately does not coerce, so the migration is the fix.

  ```
  MONGO_URI='mongodb://user:pass@host:27017/dbname' node scripts/migrate-account-disabled-to-boolean.mjs
  MONGO_URI='...' node scripts/migrate-account-disabled-to-boolean.mjs --apply
  ```

  Dry run by default — it reports what it would change and writes nothing. `--apply` performs the update, `--db=<name>`
  supplies the database when the URI carries none, `--collections=user,userAdmin` narrows the targets (that pair is the
  default). `MONGO_URI` is mandatory; the script refuses to guess a connection string. It covers `account.disabled` and
  `account.deleted` in both collections, and requires no install — `mongodb` ships with the `mongoose` peer.

  Mapping: `'true'` → `true`, `'false'` → `false` (both case-insensitive, trimmed), `''` → field removed, already-boolean
  → untouched. **Any other string is left alone and reported by `_id`**, and the run exits with code `2` — a value
  nobody planned for is not something a migration should guess at. Resolve those rows by hand and re-run. Re-runs are
  idempotent. Take a backup first: this edits account access flags.

## 5.0.3 — 2026-07-22

Security release. Upgrade from 5.0.2 or earlier: every version up to and including 5.0.2 allows a password reset to be
completed without the reset hash, under a state an unauthenticated caller can help bring about. No API change.

### Security

- `getResetPwd` no longer coerces a missing reset hash into a string. It built its return value with
  `'' + account.email.hash`, so an absent hash became the literal nine-character string `"undefined"`. That value is not
  `null`, so it cleared `updatePassword`'s guard, and it then compared equal to a caller sending that same literal as
  the `hash` argument — completing a password reset with no secret at all, only the victim's email address and the
  60-minute window. The state is reachable rather than theoretical: `account.email.hash` is a slot shared with the
  email-verification and email-change flows, and `enableEmailAccess` / `confirmNewEmail` both clear it without touching
  `account.resetDateReq`. Since `resetPwd` is unauthenticated and plants `resetDateReq` for any known address, an
  attacker could open the window themselves and wait for the victim to complete a verification. `resetHash` is now
  populated only when the stored value is a string, and fails closed to `null` (a 500) otherwise.

### Fixed

- `yarn upload` now runs `npm publish --registry=https://registry.npmjs.org/`. Yarn 1 exports the registry from `.yarnrc`
  to child processes as `npm_config_registry`, so the previous bare `npm publish` targeted the maintainer's local
  Verdaccio mirror rather than npmjs whenever it was invoked through yarn. On the maintainer machine that surfaced as
  `ENEEDAUTH` against `yarnproxy.gio.lan` and published nothing; on a machine authenticated to the mirror it would have
  published there silently, leaving npmjs without the release. npm ranks CLI flags above environment variables, so the
  explicit `--registry` wins. Repository tooling only — the published package is unaffected.

## 5.0.2 — 2026-07-22

Single source fix, no API change. `dist` output differs from 5.0.1, so consumers should upgrade — the bug below leaves a
live reset hash in the field the email-verification chain reads.

### Fixed

- `removeResetReq` now `$unset`s `account.email.hash` instead of `account.resetHash`. The latter exists in neither
  `UserBaseSchema` nor `saveResetReq` — which writes the reset hash to `account.email.hash` — so the `$unset` silently
  matched nothing and the hash outlived the reset it belonged to. The password-reset flow itself was unaffected, since
  `getResetPwd` only returns `resetHash` when `account.resetDateReq` is set and that field *was* cleared. The leak
  reached the email-verification chain instead: `userData4VerifyEmail` reads the same `account.email.hash`, so
  `handleIfHashBad` compared incoming verification links against a stale but live reset hash. The spec now pins the
  `$unset` paths against the `$set` paths of `saveResetReq`, so the two can no longer drift apart.

## 5.0.1 — 2026-07-21

Repository tooling only. No source change, so the published package is identical to 5.0.0 — `files: ["dist"]` keeps every
file below out of the npm tarball.

### Added

- `yarn.lock` is pinned to `https://registry.npmjs.org/` by a git clean/smudge filter, so a plain clone installs with no
  extra setup. Maintainers installing through a private npm mirror previously committed that host into every `resolved`
  entry, because Yarn 1 records absolute tarball URLs — clones without access to the mirror could not `yarn install`.
  `clean` rewrites the mirror to the public registry on the way into the index, `smudge` reverses it on checkout. The
  filter *definition* lives in `.git/config`, so clones that never configure it simply get the public URLs. Because
  `clean` also runs for `git diff` and `git status`, the host difference never surfaces as a modification. Override the
  mirror per machine with `YARN_PROXY_REGISTRY`. Integrity hashes are unaffected — the mirror serves byte-identical
  upstream tarballs, only the URL differs. Published tarballs were never affected either way.
- `.githooks/pre-commit` gains a lockfile backstop for clones where the filter was never configured: it reads
  `:yarn.lock` from the index and rejects any `resolved` host other than `registry.npmjs.org`. It inspects the index
  unconditionally rather than gating on the staged diff, since a tainted blob matching `HEAD` produces no diff at all.
- `.githooks/commit-msg` enforces conventional commits: types `feat|fix|chore|docs|refactor|ci` only, subject capped at
  72 characters, body at 10 lines wrapped to 72. Merge and revert commits bypass the format check. The hook also rejects
  AI-attribution words, so no such trailer is appended in this repo.
- `mocha-skill` agent skill, vendored from `lambdatest/agent-skills` and pinned in `skills-lock.json`. Generates Mocha +
  Chai + sinon tests, matching the runner this repo already uses.

### Documentation

- `README.md` gains a "Registry" section describing the lockfile filter for anyone installing through a private mirror.
- `CLAUDE.md` records the enforced commit rules verbatim. The previous "subject ≤ ~50 chars" line was a soft convention
  with nothing checking it; 50 is now stated as the target and 72 as the hard limit.

## 5.0.0 — 2026-07-21

### Changed

- **BREAKING** — all consumer-visible strings are now English. GraphQL validation error messages, transactional email
  subjects and bodies, and the `emailChangeHashVerify` mutation description (surfaced through introspection) were Italian.
  Consumers matching on literal strings such as `"L'email non puo essere vuota"` or `"La password e troppo corta"` must
  switch to the English text, or better, to the HTTP status. End users receive email in English from this version on.
- **BREAKING** — `sendConfermaResetPwdHash` and `sendOTP` no longer carry hard-coded brand copy. Both were branded
  `Polis24`, then the neutral placeholder `YourCompany`; both now use the configured `platformName` (`PLATFORM_NAME`),
  like every other method on the class. Consumers who left `PLATFORM_NAME` unset will see `undefined` in those subjects
  and bodies where they previously saw a literal placeholder.
- **BREAKING** — Italian identifiers removed from the public API. `sendConfermaResetPwd` → `sendResetPwdConfirmation`,
  `sendConfermaResetPwdHash` → `sendResetPwdConfirmationHash`, `sendEmailPostSegnalato` → `sendEmailPostReported`
  (matching the name already used by the commented-out variant in the same file). The module-internal `IInfoUtente` is
  now `IUserInfo`, and the `idUtente` / `infoUtente` parameters are `userId` / `userInfo`.
- **BREAKING** — the `package.json` export key `./email/SocketlabsLib` is corrected to `./email/SocketLabsLib`, matching
  the source filename and the exported class. The old lower-case `l` spelling no longer resolves.
- **BREAKING** — `sendOTP` returns `Promise<boolean>` instead of `Promise<string | null>`, and
  `sendResetPwdConfirmationHash` returns `Promise<boolean>` instead of `Promise<boolean | null>`. See "Fixed" below —
  the old return types described values neither function could produce.

### Fixed

- `package.json` export subpaths `./graphQL/schema/status` and `./files/validateJpgPngMimeType` pointed at `dist` files no
  source ever emitted, so both threw `ERR_PACKAGE_PATH_NOT_EXPORTED`. Repointed at real build output.
- **The subscription-activation link was broken.** `sendSubscriptionEmail` built its URL as
  `` `${this.linkBase}'/x/emailVerify` `` — a stray apostrophe inside the template literal — so every recipient got a
  dead link to `https://host.example'/x/emailVerify`. The same method's subject carried a stray trailing `}`
  (`Activate your Foo account}`).
- **`sendEmailChangeVerify` shipped raw source syntax to recipients.** Its HTML body was a template literal still
  containing `" +` and a `'` left over from a string-concatenation rewrite, so the email rendered
  `…sign in with.<br><br>" + 'You can confirm the registration…`.
- `sendResetPwdConfirmationHash` built a `subject` local, used it for the HTML `<title>`, then passed a **different**
  literal to the send call — so the message header and the subject line disagreed. One subject is now used for both.
- `sendOTP` set `ret = null` on the success path *and* in the `catch`, so it always returned `null` and no caller could
  distinguish a sent OTP from a failed one. Both methods now return the `sendTemplate` boolean, or `false` when the
  client throws synchronously. This removes the `/* c8 ignore */` that documented the dead branch.
- The fallback HTML header declared `<html lang="it">` while all copy is English since 4.0.1.
- **BREAKING** — `sendEmailPostReported` sent every report notification to a hard-coded `dummy@example.com`. It now
  addresses `process.env.DEV_TEAM_EMAIL`, the recipient `alertDevTeam` already uses. Consumers relying on the old
  address received nothing useful; consumers with `DEV_TEAM_EMAIL` unset will send to the string `'undefined'`, the same
  failure mode `alertDevTeam` has always had.

### Added

- Four missing export keys for symbols that were already public: `./graphQL/status`, `./files/validatePdfExtension`,
  `./koa/IKoaError`, `./graphQL/schema/context/IContextKoaErrorHandler`. 139 → 143 keys, all verified to resolve.

### Documentation

- 52 verified doc/code mismatches fixed across a 23-target audit. `REPO.md` claimed the repo ships no tests;
  `lib-utilities.md` still described `randomString` / `getRandomArbitrary` as `Math.random()`-based, i.e. it documented
  the exact weakness the 4.0.0 CSPRNG rewrite removes; `internal.md` described the pre-refactor verify-email guard chain
  and claimed `setLastLoginSQL` interpolates into SQL; six places said `[Validator]` Mongo errors map to 422 (they map
  to 400).
- `CLAUDE.md` gains a "Documentation — keep in sync with code" section with an `src`-path → doc-file map.

### Tests

- Test tree now genuinely mirrors `src/`: ~20 modules had no spec of their own and were only exercised transitively.
  Adds dedicated specs for the private login helpers, the access/db writers, `encryptPassword` and the Redis boolean
  codecs; splits the flat `models.spec.mts` into per-model files. 99 → 118 spec files, 616 → 653 tests. Coverage stays
  100% on all four metrics, per file.
- The email specs asserted only return values, never message content — which is why the broken activation URL, the stray
  `}` and the leaked `" +` survived a 100%-covered suite. A `sentMessage()` helper now reads the `BasicMessage` handed to
  `client.send()`, and subject/textBody/htmlBody are asserted for every bug fixed above. 653 → 657 tests.

## 4.0.1 — 2026-07-20

### Security

- **Introspection bypass when `INTROSPECTION_CODE` is unset.** The three authenticated middlewares compared the
  client-supplied `x-introspectioncode` header against `` `${process.env.INTROSPECTION_CODE}` ``. That template literal
  coerces an unset variable to the string `'undefined'`, so a client sending `x-introspectioncode: undefined` satisfied
  the check with no secret at all. Worst case is `authenticatedResourceHandler`: reaching the comparison needs only a
  self-generated v4 uuid, so an unauthenticated caller could walk past the expired/deleted-token rejection and reach
  `next()` with `ctx.state.user` never set — consumers whose routes treat "the middleware did not throw" as authorization
  served those requests. All three now call `verifyIntrospectionCode`, which returns `false` when the variable is unset or
  empty and otherwise compares with `timingSafeEqual`, on byte lengths rather than character lengths.
  Consumers with `INTROSPECTION_CODE` set see no behaviour change. Consumers who left it unset lose an undocumented
  anonymous bypass.

### Changed

- Formatting drift in `verifyEmail.mts` (import order) and `assertVerifyEmailAllowed.mts` (signature on one line) brought
  back in line with `yarn lint`. No behaviour change.

## 4.0.0 — 2026-07-20

### Security

- **Password-reset and email-confirmation hashes are now generated with a CSPRNG.** `StringLib.randomString` used
  `Math.random()` — V8's xorshift128+, whose internal state is recoverable from a modest number of observed outputs. It
  is the generator behind the password-reset hash (`resetPwd`), the signup email-confirmation hash (`registerNewUser` via
  `emailHash`) and the email-change hash (`setEmailHash`). Attack: request a reset for an account you control, read your
  own hash, recover the generator state, predict the next issued hash, trigger a reset for the victim and use it. The
  50-character length gave no protection — entropy is bounded by the generator, not the output length.
  **Deployed consumers are issuing predictable reset tokens until they upgrade.**
  Now `crypto.randomBytes` over a 32-character alphabet (5 bits/char, 250 bits for a 50-char hash; `256 % 32 === 0`, so
  no modulo bias). The alphabet narrows from 36 to 32 symbols but stays a subset of `[0-9a-z]`; existing stored hashes are
  unaffected, they are only ever compared for equality.
- `StringLib.getRandomArbitrary` moved off `Math.random()` to `crypto.randomInt` — it backs `getRandomOTP`, and a
  predictable one-time password defeats the point of one.
- **Open-redirect guard strength is now pinned by tests, not by a pattern.** The semgrep sanitizer accepted any
  `if (re.test(x))` / `if (x.startsWith(p))` / `if (x === lit)` guard with the regex left unconstrained. Demonstrated, not
  theorised: replacing the guard in `koa/router/verifyEmail.mts` with `link.startsWith('/')` passed both the scan and the
  full suite while accepting `//evil.com`.
- **Path traversal in the move helpers.** `moveImageFile` and `moveFileStaticDomain` interpolated `folder` /
  `secondFolder` straight into the destination directory and `moveTempFile` joined `destFilename` onto it, so a `..`
  component escaped `UPLOAD_IMG_DIRECTORY_URL` / `STATIC_FOLDER`. `assertNoTraversal` rejects a literal `..` component
  while still allowing separators, so a legitimate `2026/07` keeps working (`path.basename()` would silently rewrite it
  to `07`). `sourceFilePath` and `destinationDir` are left unchecked on purpose — operating on the given path is those
  functions' contract.
- **Logout deleted the wrong Redis keys.** `logout` re-added the `refresh:` / `access:` prefix to tokens that already
  carried it, deleting `${REDIS_KEY}refresh:refresh:<uuid>` — a key never written. `del()` on a missing key returns 0 and
  the resolver swallows errors, so the refresh session silently survived logout. Keys now go through
  `buildPrefixedRedisKey`, which is idempotent, so consumers wiring `ctx.state.user` with a bare uuid keep working.
- The access-token suffix is now validated against the v4 uuid shape `generateAccessToken` produces — rejected with 499
  in `authenticatedResourceHandler`, ignored in `authenticatedLogoutHandler` where the access token stays optional.

### Changed

- **BREAKING** — `storeUploadAsTemp` now **rejects** on an oversize upload or a stream failure. It previously resolved in
  both cases, returning an `IStoreFile` whose `filePath` had just been deleted, so callers received a success and a dead
  path. `'close'` is now the single settle point; failure paths only record the cause and stop the stream. The real
  underlying error is propagated instead of a blanket `'File size exceeds the limit.'`, and the oversize message no longer
  interpolates `{maxFileSize}` without a `$` or calls bytes MB.
  Cleanup is now uniformly fire-and-forget, so the `Sentry.captureException` previously raised when the unlink itself
  failed is gone.
- **BREAKING (additive)** — `scanVirus` now returns `{ isInfected, viruses, alerted, scanned }` instead of `undefined`.
  Callers ignoring the result are unaffected. `scanned: false` means the scan did not complete — treat it as **unknown,
  not clean**. `scanVirus` still never throws on detection: blocking remains the caller's decision.
- `handleIfHashBad` takes a single options object instead of 5 positional parameters. It lives in `src/private/**` and has
  no `exports` entry, so the signature change cannot reach consumers.

### Added

- `lib/isSafeRedirectTarget` — the vetted redirect allowlist guard, extracted so its strength is pinned by tests rather
  than by a semgrep pattern that cannot evaluate what a regex admits. The spec asserts the concrete attack strings:
  protocol-relative, absolute http(s), backslash-prefixed, `javascript:`, lookalike prefixes, bare prefix, relative,
  empty, newline-smuggled, query/fragment delimiters.
- `isSessionBlocked` gains its `package.json` `exports` entry — it shipped in `dist` but consumers could not import it.
- `.github/workflows/semgrep.yml` — until now semgrep ran in no CI workflow at all. The canary job runs **first** and
  gates the scan: a rule that has been narrowed, typo'd or broken by an upgrade reports "0 findings" exactly like a clean
  codebase does. Image pinned to `1.169.0` in CI, `SEMGREP_IMAGE` overridable locally.
- `scripts/semgrep-canaries/` and `yarn semgrep:canary` — three buckets (must-fire, must-not-fire, known-gap). `known-gap`
  fixtures are asserted silent as a tripwire, so a documented blind spot is never recorded as intended behaviour and a
  coverage improvement fails the run until the list is updated.
- `koa-utils.nosql-injection.mass-assignment-update-doc` — the three existing NoSQL rules inspected only the filter
  argument, leaving the update document (`role`, `isAdmin`, `account.email.valid`) uncovered.
- Rule flagging non-exported helpers that hand a parameter to `fs` unsanitized — Semgrep OSS has no interprocedural taint
  and `--pro` refuses to run unlicensed, so the rule asks a question answerable inside one function. Flags a shape, not a
  proven flow: severity `WARNING`, confidence `LOW`.
- ESLint size/complexity budget (`max-lines`, `max-lines-per-function`, `max-params`, `max-depth`, `complexity`) for
  `src/**/*.mts` and `test/`, registered at `warn`.

### Fixed

- **The verify-email guard chain was untestable and hid six lethal defects.** `routerVerifyEmail`'s only entry point is a
  DB read that cannot be stubbed under the tsx loader, so the whole try-body was dead code under a `c8 ignore`. Each of
  these was verified green against the full suite beforehand: deleting the `handleIfAccountDisabled` call, negating the
  deleted flag (healthy accounts blocked, deleted ones let through), comparing the URL hash against **itself** (any hash
  validates any account), hard-coding `requestTimes` to 0 (lockout permanently disabled), dropping the `await` on the hash
  check, and moving `enableEmailAccess` ahead of the remaining guards. The chain now lives in
  `private/lib/access/assertVerifyEmailAllowed.mts`, which returns the id to enable and deliberately does **not** enable
  the account — the irreversible side effect cannot be reordered ahead of a guard by construction.
- `reEncodeToJpeg('x.jpeg')` and `reEncodeToPng('x.png')` always threw `Error('Error processing the image')`. sharp
  refuses to use one file as both input and output, and `reEncode` built `finalFilepath` by swapping the extension, so
  when the source already carried the target one the paths were identical. The source is now read into a Buffer first —
  a buffer input has no path to collide with.
- `reEncode` decides whether to delete the original by comparing **paths**, not extensions. With the buffer fix in place
  the old check would have deleted the file it had just written whenever `filePath` carried no extension. Side effect: a
  case-mismatched extension (`.JPEG` → `jpeg`) now removes the original instead of leaving a stale duplicate.
- Stale semgrep rule metadata: the SQL rule asserted a "confirmed live finding" at `setLastLoginSQL.mts:18` long after
  that line became a parameterized query; the redis rule cited the wrong line and omitted a second instance. Frozen canary
  counts are removed from the yml entirely — they live in the runner's output, which cannot go stale.
- Semgrep rule coverage: header sources matched by accessor shape instead of a two-name allowlist, `ctx.cookies.get()`
  added, open-redirect gains header/cookie sources, `fs` sinks extended to `copy`/`rename`/`appendFile`/`outputFile`/
  `rm`/`readdir` and namespaced `fs.createWriteStream` / `fs.createReadStream`, SQL source covers plain concatenation.
- NoSQL rules match a filter built in a local variable (`const f = {[k]: v}; findOne(f)`), not only an inline object
  literal at the call site.
- Path-traversal rule scoped to reachability instead of "any function parameter is a source", which was tautological for a
  filesystem utility library and produced 7 permanently-accepted findings.
- `cloc`/`scc` exclude lists named `.hg`, a Mercurial directory this repo never had, while `.git` was left to be walked.

### Tests

- **`src/private/**` is now covered and measured.** `.c8rc.json` excluded `dist/private/**`, hiding 37 files including
  the whole email-verification and account-access chain — inverting the check in `handleIfAccountDisabled` left the suite
  reporting a clean 100%. 19 new specs, exclusion dropped, 94.85% → 100%.
- Hard 100% coverage gate enforced locally, per file: `.c8rc.json` `check-coverage`/`per-file` with all four metrics at
  100, plus `.githooks/pre-commit` running `yarn test:coverage` on commits touching `src/`, `test/`, `package.json`,
  `.c8rc.json`, `.mocharc.json` or `tsconfig*.json`. Docs-only commits skip it. `yarn hooks:install` wires
  `core.hooksPath`, invoked from `prepare`.
- Mutation testing: 30 semantic mutations applied one at a time; 24 survived a green suite. Closed across several commits —
  refresh TTLs matched to their own key (swapping them gave the access token a 90-day lifetime), the rotated cookie
  **value** asserted (sinon matches on an argument prefix, so the value was never inspected), `ctx.state.user.id` read
  back in both authenticated middlewares (replacing it with a fresh ObjectId passed), `SALT_ROUNDS=14` asserted from the
  hash's cost factor, `endSession` asserted on the success path of six resolvers (moving it from `finally` to `catch`
  leaked a `ClientSession` on every successful call), the MIME allowlists driven with real-but-disallowed types instead of
  undetectable plaintext, the `|| ''` access-token fallback in logout exercised with the property absent, and the `await`
  on the old refresh-key deletion pinned (dropping it left the rotated-out key alive — session fixation).
- `extractBearerAccessToken`'s `Bearer access:` prefix check is pinned with a realistic token. The existing test named
  "ignores an authorization header that is not prefixed Bearer access:" used a fixture that is not a v4 uuid, so the uuid
  check rejected it either way — removing the prefix check kept all 579 tests green. A client sending
  `Bearer refresh:<valid uuid>` could read refresh entries through the access branch.

### Documentation

- All Italian comments in `src/` and `test/` translated to English, including text and identifiers inside commented-out
  code. Verified by parsing each file before and after with the TypeScript compiler and re-printing with `removeComments`:
  all 22 files produce byte-identical output. Commented-out `console.debug` lines are translated, not removed.

## 3.8.3 — 2026-07-19

### Security

- `authenticatedLogoutHandler` built the Redis key straight from the raw `Authorization` header. Unlike
  `authenticatedResourceHandler` it never checked the `Bearer access:` prefix, so a client controlled the whole key and
  could reach `refresh:` entries through the access branch. The access token is optional here, so a malformed one is now
  ignored rather than rejected — no new error path for existing clients.
- `setLastLoginSQL` interpolated `id` and the timestamp into the SQL string. Switched to sequelize `replacements`,
  matching `infoUserForLoginSQL`.

### Added

- Semgrep SAST for the Koa → Mongo/Redis/SQL injection surface (`.semgrep/koa-utils.yml`, 7 rules). Qodana ships no JS/TS
  taint analysis (JVM/PHP only) and gitnexus `--pdg` recognises no Koa taint sources, so that surface had no static
  coverage at all. Semgrep 1.169.0 cannot select `.mts` files, so `scripts/semgrep.sh` mirrors `src/**/*.mts` into a temp
  shadow tree as `**/*.ts` with byte-identical content (line numbers map 1:1) and rewrites the extension back in the
  output. Not wired into CI at this version.
- `pdg: true` pinned in `.gitnexusrc` so a plain `gitnexus analyze` keeps the PDG layer.

### Fixed

- `scripts/semgrep.sh` never passed `--error`. `semgrep scan` exits 0 even when reporting blocking ERROR-severity
  findings, so a clean scan and a scan full of criticals were indistinguishable to any caller.

## 3.8.2 — 2026-07-10

### Added

- `CheckModuleLicenses` enabled in Qodana. It ships `enabledByDefault=false`, so it needs an explicit include.
  `CheckThirdPartySoftwareList` is left off on purpose: it reports High until a generated licenses list is committed,
  which would trip `failureConditions.severityThresholds.high: 0`. `raiseLicenseProblems` is unset, keeping license
  findings report-only.

### Documentation

- `docs/code/` reference pages added.

## 3.8.1 — 2026-07-10

### Changed

- `throwMongoDBErrors` return type is now `never` — it always throws.
- `qodana.yaml` gains `failureConditions.severityThresholds` with `critical: 0` and `high: 0`.

## 3.8.0 — 2026-07-10

### Fixed

- `RedisDisconnect` calls `redisClient.close()` instead of the removed `quit()`.
- `tsconfig.build-tests.json` repaired so the test build runs again.

