# @axiumine/koa-utils

A TypeScript utility library for Koa-based backends authored by Giovanni Manzoni / Axiumine. Bundles authentication, GraphQL error handling, data-source connectors (MongoDB, MariaDB, PostgreSQL, Redis), file upload pipelines, transactional email (SocketLabs), and reusable middleware.

Distributed on npm as ESM-only (`.mjs`) with `.d.mts` declarations. Node `^24.14.0 || ^26.13.0`, TypeScript `6.0`.

---

## 1. Layout

```
src/
├── dataSources/      # Connect/disconnect helpers for Mongo, MariaDB, PostgreSQL, Redis
├── email/            # SocketLabsLib (transactional email client, hard-coded copy); createSocketLabsSender (one-mail sender, peer @socketlabs/email only) + its types ISocketLabsSenderOptions, ISocketLabsMessage, ISocketLabsSendResult, ISocketLabsClient
├── files/            # Upload pipeline: store → validate ext+mime → ClamAV scan → re-encode (sharp) → move
├── graphQL/
│   ├── models/MongoDB/   # Mongoose models (UserBase, log/*)
│   ├── schema/
│   │   ├── GraphQLInput/ # Reusable input object types
│   │   ├── context/      # IContext* type defs for Koa+GraphQL ctx
│   │   ├── interfaces/   # IFindAndUpdate result shape
│   │   ├── mutations/    # signUp, login*, logout, refresh, resetPwd, updatePassword, emailChangeHashVerify
│   │   └── types/        # GraphQLObjectType exports (LoginType, RetStatusType, ...)
│   ├── throw/        # throw* helpers — each wraps throwGraphQLError(status, title, desc)
│   └── status.mts    # status string constants
├── koa/
│   ├── middleware/   # authenticatedAuthorizationHandler, authenticatedResourceHandler, authenticatedLogoutHandler, debug
│   ├── router/       # routerVerifyEmail (Koa router handler)
│   ├── customFormatErrorFn.mts  # GraphQL error formatter
│   ├── createKoaErrorHandler.mts # Koa error middleware factory (statusOf/bodyOf/report/noBodyStatuses), 0 peers
│   ├── tdwKoaErrorHandler.mts   # Top-level Koa error middleware: the factory + GraphQL, Sentry, dotenv
│   ├── logRequestToDb.mts       # Request pass-through middleware (no-op)
│   ├── IFileUpload.mts          # graphql-upload-compatible shape
│   ├── IKoaError.mts
│   ├── IKoaErrorHandlerContext.mts  # status/body/app.emit the factory reads and writes
│   └── IKoaErrorHandlerOptions.mts  # options of createKoaErrorHandler
├── lib/
│   ├── Constants.mts           # OBJECTID_0_STR, EMAIL_MAX_LEN, MIN/MAX_PWD_LENGTH (10/72 OWASP bcrypt), EMAIL_HASH_LEN
│   ├── OBJECTID_0_OBJ.mts      # OBJECTID_0_OBJ (mongoose ObjectId; own subpath so Constants does not load mongoose)
│   ├── tokens.mts              # uuid v4 (node:crypto randomUUID) access/refresh + accessTokenExpiry (30–90 min random)
│   ├── tokenOptions.mts        # cookie defaults — httpOnly, sameSite:Strict, secure:false (set in nginx)
│   ├── setLoginCookies.mts     # writes refresh_token cookie with 90d maxAge
│   ├── ICookies.mts            # Cookies interface (subset)
│   ├── encryptPassword.mts     # @node-rs/bcrypt hash, SALT_ROUNDS=14
│   ├── hash.mts                # compareHashAsync (bcrypt compare)
│   ├── emailHash.mts           # random hex string for email verify
│   ├── checkEmailLen.mts       # 1..EMAIL_MAX_LEN
│   ├── checkPwdLen.mts         # MIN_PWD_LENGTH..MAX_PWD_LENGTH
│   ├── tryCatchRethrow.mts     # GraphQL/Mongo error normaliser
│   ├── throwIfNotValidEnumValue.mts
│   ├── sleepMs.mts
│   ├── isIntrospectionBypassAllowed.mts # NODE_ENV allowlist (development|test) gating the introspection bypass
│   ├── isSafeRedirectTarget.mts # allow-lists `/x/...` redirect targets
│   ├── isSessionBlocked.mts    # true when a Redis session is disabled/deleted
│   ├── isValidUuidV4.mts       # uuid v4 shape check
│   ├── ArrayLib / DateLib / NumLib / StringLib  # static utility classes
│   ├── IAuthorizationDisDel.mts
│   ├── makeOnboardingData.mts
│   ├── access/                 # model-agnostic access flows (5.3.0+)
│   │   ├── accessPaths.mts     # TAccessModel, TOnAbandon, IResetPwdPaths/IVerifyEmailPaths + frozen defaults + resolve*
│   │   ├── createMailThrottle.mts     # TMailThrottle, in-process per-key debounce, ALWAYS_MAIL opt-out
│   │   ├── createResetPwdFlow.mts     # { resetPwd, updatePassword } bound to any model/layout
│   │   ├── createVerifyEmailFlow.mts  # whole verify-email chain bound to any model/layout
│   │   ├── resetPwdMailer.mts         # IResetPwdMailer, socketLabsResetPwdMailer, createResetPwdMailer
│   │   └── verifyEmailMailer.mts      # IVerifyEmailMailer, socketLabs*/throttleMailer/default*
│   ├── MariaDB/                # IMariaDBErr, MariaDBErrType, throwSqlErrors
│   ├── MongoDB/                # IMongoDBError, MongoDBErrType, throwIfMongoErr, throwMongoErrors, IOnboarding
│   ├── PostgreSQL/             # IPostgresError, IPostgresErrorCodes, makePostgreSqlLogError; the driver-agnostic kit in subfolders (0 peers, docs/code/lib-postgres.md):
│   │   ├── error/              # DbParseError, DbConnectError, DbTxError (+ DB_*_REASONS, IDb*Reason), IDbErrorFactory, sqlstateOf, sqlstateField, constraintNameOf, errorNameOf, mapDbError, IMapDbErrorOptions, IDbErrorCounter(Name), DB_INTERNAL_REASONS, IDbInternalReason, buildConstraintEntry, lookupConstraint, IConstraintEntry, IConstraintTable, IConstraintEntryBuilder, RoleAssertionError, ROLE_ASSERT_REASONS, IRoleAssertionReason, IRoleAssertionSubject, DbClockError, DB_CLOCK_REASONS, IDbClockReason, LockOrderError, LOCK_ORDER_REASONS, ILockOrderReason, DbStateError, DB_STATE_REASONS, IDbStateReason
│   │   ├── parse/              # parseDate, parseTime, parseTimestamptz, parseInt8, parseUuid, arrayOf, TYPE_PARSERS, createTypeRegistry, IStringParser, IArrayParser, IDriverTypes, ITypeParserEntry
│   │   ├── pool/               # createPool, DEFAULT_CONNECT_TIMEOUT_MS, DEFAULT_KEEPALIVE_INITIAL_DELAY_MS, REQUIRED_SESSION_TIME_ZONE, ICreatePoolOptions, IDbDriver, IPoolEvents, IPoolLogger, IPoolCounter, IPoolCounterName
│   │   ├── clock/              # createDbClock, lockTaken, CLOCK_SQL, DB_NOW_SQL, IClock, IDbClock, IDbClockOptions, IDbClockSeam (the errors are in error/)
│   │   ├── counter/            # IDbCounter<TName>
│   │   ├── lock/               # createLockOrderTracker, claimRowsSkipLocked, lockedRow, lockedRows, uuidOf, uuidsOf, rowLockModeOf, ROW_LOCK_MODES, CLAIM_LIMIT_MAX, ILockOrderSpec, ILockOrderTracker, ILockTrackerConfig, ILockTrackerOptions, ILockAdmission, IRowLockMode, IClaimRegistry, IClaimRequest (the error is in error/)
│   │   ├── guard/              # assertAffected, guardVersion, VERSION_GUARD_FIELDS, IAffectedResult, IVersionGuardInput, IVersionGuardField, IVersionGuardCode, IGuardCounter
│   │   ├── role/               # assertRole, IAssertRoleOptions, IRoleGrant, IRolePool, IRoleAssertion (the error is in error/)
│   │   ├── tx/                 # withTx, jitteredDelay, defaultRetryDelay, DEFAULT_LOCK_TIMEOUT_MS, MAX_LOCK_TIMEOUT_MS, TX_RETRY_MAX, TX_RETRY_MAX_CEILING, TX_RETRY_BASE_DELAY_MS, TX_ISOLATION_LEVELS, TX_FAILURE_REASONS, ITx, ITxResult, ITxClient, ITxPool, ITxOptions, ITxIsolation, ITxFailureReason, ITxCounter, ITxCounterName, IRetryDelay
│   │   └── url/                # databaseUrlReason, LOOPBACK_HOSTS, isValidHost, isAbsolutePath, IDatabaseUrlOptions, IDatabaseUrlReason
│   ├── Redis/                  # buildPrefixedRedisKey, RedisBoolean enum + to/from helpers
│   ├── db/
│   │   ├── log/                # hitStat, logGlobalError, logGraphql, logThrow
│   │   ├── login/              # ILoginSet, ILoginUnset
│   │   ├── registerNewUser.mts
│   │   └── userExist.mts
└── private/          # Internal helpers — NOT exported via package.json
    ├── dataSources/isRedisTlsRequired.mts, redisNodeUrl.mts, resolveRedisUrl.mts  # REDIS_TLS scheme gate
    ├── email/accountMessages.mts, resetMessages.mts, noticeMessages.mts, htmlFrame.mts, messageParts.mts, escapeHtml.mts, orFalse.mts, IEmailContent.mts  # SocketLabsLib copy builders + HTML escaping
    ├── files/_validateMimeType.mts, reEncode.mts
    ├── graphQL/Consts.mts, schema/{context,mutations}/
    └── lib/access/{db/* (incl. abandonUser.mts), handleIf*, assertVerifyEmailAllowed.mts, emailChangeHandlers.mts, pathTools.mts,
                   safeEqualSecret.mts, assertResetAllowed.mts, applyPasswordReset.mts}
        lib/importOptional.mts, loadEnv.mts, sentry.mts, createSentryClient.mts, ISentryClient.mts  # optional-peer loader, dotenv + Sentry facades
        lib/PostgreSQL/{civilCalendar, readField, errorCodeOf, poolUrlSecrets, scrubSecrets, assertPoolOptions, connectAndCheck, checkedClient, txSettings, txHandle, txFailure, runTxBody, runTxAttempt, runTxWithRetries, TX_BEGIN_STATEMENTS, internalFailure, mapViolation, mapTypedError, constraintDetails, constraintField, assertVersionGuardInput, versionText, POSTGRES_STATE_KEY, POSTGRES_STATE_LAYOUT, postgresState, clockSlot, clockInstant, clockStatement, lockOrderPlan, admitLock, rankCheckOption, ROLE_CATALOG_SQL, ROLE_ATTRIBUTES, ROLE_PRIVILEGES, rolePlan, roleCheckOf, roleFailureSubject, checkRoleOnClient, runRoleChecks, membershipOutsider, missingGrant, missingColumn, missingObject, catalogRows, catalogRow, catalogText, catalogFlag, isRoleName, isQualifiedName, isOneOf, isNameList}.mts + I*.mts  # internals of the PostgreSQL kit
```

`src/types/` holds one ambient declaration, `socketlabs-email.d.ts` (`declare module '@socketlabs/email'`, which ships no types); it emits no `.mjs`.

Area-scoped agent rules live in nested `CLAUDE.md` files, loaded on demand when an agent touches that directory: `src/graphQL/`, `src/koa/`, `src/lib/access/`, `src/private/`, `src/email/`, `src/files/`, `test/`, plus `.github/` (CI, release, deprecation rules) and `.githooks/` (Qodana gate, mutation gate, npm proxy rules). Repo-wide rules stay in the root `CLAUDE.md`. Not shipped — `files: ["dist"]`.

Outside `src/`: `docs/code/` is the per-area reference (index `docs/code/README.md`); `docs/architecture.md`, `docs/security.md` and `docs/verify-release.md` are the design, the security model and the release verification pages; the community and policy files sit at the repo root (see section 9). The npm tarball holds `dist/` plus `package.json`, `README.md` and `LICENSE` only, so the `README.md` links to repo files are absolute GitHub URLs.

---

## 2. Build & publish

| Script | Action |
|---|---|
| `yarn build` | clean + `build:esm` only — production target |
| `yarn build:all` | `build:cjs` + `build:esm`. Fails today because `build:cjs` emits nothing (the package is ESM-only); use `yarn build` |
| `yarn build:esm` | `tspc -p tsconfig.json`, rename `.js` → `.mjs`, flatten `dist/esm/*` → `dist/` |
| `yarn build:cjs` | `tsc -p tsconfig.cjs.json`, rename `.js` → `.cjs`, flatten `dist/cjs/*` → `dist/`. Emits nothing today: its `include` matches `*.ts` and every source file is `.mts`, so the `find dist/cjs` step exits 1 |
| `yarn build:tests` | `tspc -p tsconfig.build-tests.json` into `dist-test/`, rename `.js` → `.mjs` |
| `yarn prepare` | `hooks:install` + `rm -rf dist && yarn build` — runs on `npm install` |
| `yarn prepare:all` | `rm -rf dist && yarn build:all` (fails with `build:all`, see above) |
| `yarn hooks:install` | `git config core.hooksPath .githooks` (no-op outside a git repo); picks up every hook in the directory, `pre-push` included. Rewrites no lockfile |
| `yarn registry:mirror` / `registry:canonical` / `registry:check` | `node scripts/registry-rewrite.mjs mirror\|canonical\|check`: rewrite the registry host of the `yarn.lock` `resolved` URLs to `$REGISTRY_MIRROR` (before install), back to `https://registry.npmjs.org` (before commit), or exit 1 if any other host is present. Opt-in; `check` needs no env |
| `yarn lint` | `eslint --fix` + `prettier --write 'src/**/*.mts' 'scripts/**/*.mts'` |
| `yarn lint:check` | `eslint --max-warnings 0 --cache` + `prettier --check` on `src` and `scripts` — read-only variant of `lint` |
| `yarn typecheck` | `tsc -p tsconfig.check.json --noEmit` — `src/` with `exactOptionalPropertyTypes` |
| `yarn typecheck:scripts` | `tsc -p tsconfig.scripts.json` — `scripts/**/*.mts`, no emit |
| `yarn typecheck:tests` | `tsc -p tsconfig.tests.json` — `test/**/*.mts` and `test/**/*.ts`, no emit, same strict flags as `typecheck` |
| `yarn caps` / `caps:update` / `caps:report` | code-size ratchet (`scripts/check-code-caps.mts`): check, lower the baseline, list every violation. `caps:update` only lowers, never raises or adds, and exits 1 while new or grown violations remain. A source file that does not parse, an unreadable `src/` or `scripts/`, or a symlink in them exits 2 |
| `yarn ratchet:against [ref]` | compares `.code-caps-baseline.json` and `eslint-suppressions.json` with `<ref>` (default `origin/main`): fails on a new key or a higher value, exits 2 if the ref is unknown (`git fetch origin main`). Not part of `check:static` (needs a ref); CI runs it on pull requests, `pre-push` against the merge base |
| `yarn knip` | unused files, exports, types and dependencies (`knip.config.js`) |
| `yarn type-coverage` | `type-coverage` at least 99.5 (non-strict) and at least 96.7 (`--strict`) |
| `yarn fta` | FTA maintainability score per file, cap in `fta.json` |
| `yarn check:static` | all the static gates in order: `caps`, `lint:check`, `typecheck`, `typecheck:scripts`, `typecheck:tests`, `knip`, `type-coverage`, `fta`. Single source for the pre-commit hook, the pre-push hook and the CI step `Static gates` |
| `yarn mutation` | `patch-package && stryker run`: full StrykerJS mutation run in a sandbox copy (about 13 min); report in `reports/mutation/`; the weekly CI run is advisory, `thresholds.break` in `stryker.config.json` is 100 (100% of non-disabled mutants; 12 `Stryker disable` comments in `src`, 13 ignored mutants; last full run 12 min 35 s) |
| `yarn mutation:changed [base-ref]` | mutate only the `src/**/*.mts` files changed against the merge base (default `origin/main`, else `HEAD~1`); `scripts/mutation-changed.sh` |
| `yarn leak:check` | memory-leak tripwire (`scripts/leak-check.mts`, needs `yarn build` first); CI weekly and on dispatch only, advisory |
| `yarn test` | `build` + `build:tests` + `mocha` — no coverage check |
| `yarn test:watch` | `mocha --watch` |
| `yarn test:coverage` | `build` + `build:tests` + `c8 mocha` — fails below 100% coverage on any file |
| `yarn qodana` | `test:coverage` then a dockerised Qodana scan |
| `yarn qodana:cli` | `test:coverage` then `qodana scan` via local CLI, sourcing `.env` |
| `yarn semgrep` / `semgrep:all` / `semgrep:canary` | run `scripts/semgrep*.sh` (local, `--registry`, canary variants) |
| `yarn upload` | `npm publish --registry=https://registry.npmjs.org/` (uses `.npmrc` token). The explicit `--registry` is required — see "Publishing" below |
| `yarn clean` | `rm -rf ./dist` |
| `yarn cloc` / `yarn scc` | code metrics, exclude node_modules/dist |
| `yarn update` | interactive dep upgrade |

`tspc` = `ts-patch`'s patched tsc, needed for the `typescript-transform-paths` plugin that rewrites `@lib/*`, `@throw/*` etc. into relative paths in emitted `.mjs` / `.d.mts`.

Source files use `.mts` extension and `.mjs` import specifiers (NodeNext module resolution). Path aliases (`tsconfig.json` `paths` + `package.json` `_moduleAliases`):

| Alias | Resolves to |
|---|---|
| `@lib/*` | `src/lib/*` (build: `dist/lib`) |
| `@throw/*` | `src/graphQL/throw/*` |
| `@models/*` | `src/graphQL/models/*` |
| `@context/*` | `src/graphQL/schema/context/*` |
| `@stypes/*` | `src/graphQL/schema/types/*` |
| `@private/*` | `src/private/*` |
| `@email/*` | `src/email/*` |
| `@dataSources/*` | `src/dataSources/*` |

`tsconfig.json` highlights: `target: ES2023`, `module: NodeNext`, `strict: true`, `declaration: true`, `outDir: ./dist/esm`, `declarationDir: ./dist/esm`. `tsconfig.cjs.json` is a leftover CJS config that emits nothing today (see `build:cjs`).

---

## 3. Package exports

`package.json` enumerates 150 explicit subpath exports — no barrel, no root entry. Consumers import deep paths:

```ts
import { authenticatedResourceHandler } from '@axiumine/koa-utils/koa/middleware/authenticatedResourceHandler'
import { throwForbiddenError } from '@axiumine/koa-utils/graphQL/throw/throwForbiddenError'
import { redisClient, RedisConnect } from '@axiumine/koa-utils/dataSources/Redis'
import { loginRememberme } from '@axiumine/koa-utils/graphQL/schema/mutations/loginRememberme'
```

Every exported subpath maps to `{ import: dist/.../X.mjs, types: dist/.../X.d.mts }`. Adding a new public API requires adding a corresponding entry to the `exports` map.

`private/*` is intentionally absent from `exports` — those modules are internal.

---

## 4. Runtime concerns

### Auth flow (high level)

1. **`signUp`** mutation: validates email/pwd lens, looks up `UserBase` in Mongo transaction, creates user with `account.email.valid=false`, generates `EMAIL_HASH_LEN` hash, sends verify email via `SocketLabsLib`.
2. **`routerVerifyEmail`** Koa router: chain of `handleIf*` guards (deleted, disabled, hash mismatch, expiry, too many attempts) → on success calls `enableEmailAccess`, redirects to `/x/registration-done`; on failure redirects to encoded URL allowed by `^/x/[a-zA-Z0-9._\-%/]+$` or `/x/error`.
3. **`loginRememberme` / `login4Ever` / `loginAdmin`** mutations: mongo session + transaction, `checkUserLoginAuthorization` (compares bcrypt hash), `updateLoginStats*`, generate uuid access+refresh tokens, `setRedisLoginSession`, `setLoginCookies` writes signed `refresh_token` cookie (90 d max-age).
4. **`authenticatedResourceHandler`** middleware: reads `Authorization: Bearer access:<uuid>` header, looks up `${REDIS_KEY}access:<uuid>` in Redis (`hGetAll`); blocks if `disabled` or `deleted` flag in session; populates `ctx.state.user`. Falls back to allowing through if `x-introspectioncode` matches `INTROSPECTION_CODE` env **and** `NODE_ENV` is `development` or `test` (6.0.0+ gate — outside those two values the header is ignored entirely).
5. **`authenticatedAuthorizationHandler(keys: Keygrip)`** middleware: verifies signed `refresh_token` cookie via `Keygrip.index()`, looks up `${REDIS_KEY}refresh:<uuid>`, populates `ctx.state.user`. Used to authorise `refresh` mutation only.
6. **`refresh`** mutation: rotates both tokens, writes new Redis keys with `accessTokenExpiry()` (random 30–90 min) and `REFRESH_TOKEN_EXPIRY` (90 d) TTLs, deletes old refresh entry.
7. **`logout`** + `authenticatedLogoutHandler`: deletes refresh + (optional) access Redis keys, clears cookie.

### Errors

`throwGraphQLError(status, title, desc)` wraps `new GraphQLError(title, { extensions: { http: { status }, description } })`. Every `throw*` helper in `graphQL/throw/` is a thin wrapper with a fixed HTTP code + title. `tdwKoaErrorHandler` is the top-level Koa middleware that catches, sets `ctx.status` from `extensions.http.status`, sets `ctx.body = { message, description }` (skipped for 100/101/102/204/205/304), and emits `'error'` on the app. `customFormatErrorFn` is the formatter passed to graphql-http / koa-graphql. `createKoaErrorHandler` is the factory under `tdwKoaErrorHandler` (8.0.0): `statusOf`, `bodyOf`, `report` and `noBodyStatuses` options, status, body, report and `emit('error')` in one synchronous `catch`; it imports nothing, so it reaches no peer (`PEER_BUDGET` in `test/package/peerReach.spec.mts`), and a Koa service with its own error policy builds its handler from it instead of copying `tdwKoaErrorHandler`.

`tryCatchRethrow(e)` is the standard `.catch` body inside every mutation: forwards Mongo errors via `throwIfMongoErr` (turns `DuplicateKeyError` into 409, `[Validator]` prefix into 400), re-throws GraphQL errors verbatim, captures the rest to Sentry and throws `throwInternalError()`.

### Data sources

Each connector reads `.env` via the internal `loadEnv()` (`dotenv.config()` when `dotenv` is installed) at import time. Functions are `*Connect()` / `*Disconnect()` async; connection objects (`sequelize`, `pgClient`, `pgPool`, `redisClient`) are exported as module-level singletons. `MongoDB` uses `mongoose.connect(process.env.MONGODB_URI)` with `sanitizeFilter: true`, `strictQuery: false`, `family: 4` (IPv4), `serverSelectionTimeoutMS: 5000`, `autoIndex: true`.

`redisClient` supports cluster mode when `REDIS_IS_CLUSTER === '1'` (3 nodes from `REDIS_DB{1,2,3}_HOST/PORT`); otherwise single via `REDIS_URL`.

Both paths take their scheme from `REDIS_TLS`, via the three `private/dataSources/` helpers. Set to exactly `true` it builds cluster root nodes as `rediss://` **and** sets `defaults.socket.tls` (node-redis does not inherit root-node TLS for the connections it opens to discovered nodes), and it requires `REDIS_URL` to carry the `rediss:` scheme — `resolveRedisUrl` throws at module load otherwise, rather than upgrading the scheme silently. Any other value, unset included, is off and keeps the pre-flag plaintext behaviour. See `docs/code/data-sources.md` and `docs/code/internal.md`.

### PostgreSQL kit (`lib/PostgreSQL/{error,parse,pool,url,counter,tx,guard,role,clock,lock}/`)

Driver-agnostic leaf pieces, the transaction wrapper, the error mapper, the write guards, the role assertion, the per-transaction clock and the lock-order tracker, 0 peers at runtime and in `.d.mts` (budgeted `[]` in `PEER_BUDGET`, `test/package/peerReach.spec.mts`). `createPool` takes the `pg` module as its `driver` argument and uses `Pool`, `Client` and `types` through the structural `IDbDriver`; no file imports `pg`. One value export per file, file name = export name, types in `I*` files, no barrel. The parsers (`parseDate`, `parseTime`, `parseTimestamptz`, `parseInt8`, `parseUuid`, `arrayOf`) return strings and never build a `Date`; `createTypeRegistry` hands them to a pool as its `types` option without calling `setTypeParser`. Errors carry a closed reason, a fixed message and no `cause`. `withTx(pool, options, fn)` (`tx/`) runs `fn` in one transaction with a closed `BEGIN`, `SET LOCAL lock_timeout`, a bounded retry on SQLSTATE 40001 and 40P01, a handle that dies with the transaction, and the error for a give-up built by the caller's `IDbErrorFactory` (only `internal` is read), so no application error class is imported. `mapDbError(error, { errors, table, logger })` (`error/`) turns any thrown value into an error of the caller's family: an error the factory recognises passes through, `DbParseError` / `DbConnectError` / `DbTxError` and any other SQLSTATE become `errors.internal(reason)` with a reason from `DB_INTERNAL_REASONS`, and SQLSTATE 23505 / 23514 / 23503 are looked up by constraint name in a table the caller passes (`buildConstraintEntry`, `lookupConstraint`; the kit ships no table); it logs reason, SQLSTATE and constraint name only. `assertAffected` and `guardVersion` (`guard/`) refuse an update that matched no row, and `guardVersion` re-reads the row to answer `NOT_FOUND`, `STALE_VERSION` or `STALE_REV` through the same factory. `assertRole(pool, { expectedRole, expectedGrants, allowedMemberships })` (`role/`, `RoleAssertionError` in `error/`) is the boot check that the connected role is the expected one: fixed catalog statements on one connection, in a fixed order (role name, the five attributes, ownership, memberships, `session_user`, the grants), a closed reason per failure, the pool closed before the error is thrown, and a malformed catalog answer is `CHECK_FAILED`, never a pass; the expected grants are a parameter. `createDbClock(tx, { write, seam })` (`clock/`) is the server time as epoch milliseconds, read once per transaction by `CLOCK_SQL` (`read()` asynchronous, `now()` synchronous); a write transaction cannot read it before `lockTaken(tx)`, which a lock helper calls after its lock (`lockedRow` and `lockedRows` do), and a test seam is a caller-supplied statement that is refused unless the caller's own `allowed` flag is exactly `true`. The slot of a transaction lives in a frozen registry on `globalThis` under `Symbol.for('@axiumine/koa-utils/postgres-state')`, so two copies of the package share it, and a copy that finds a registry of another layout throws `DbStateError` while loading. `createLockOrderTracker(spec)` (`lock/`) takes the ordered ranks per mode, the helper-to-rank table and the default mode, checks and copies them, and answers a tracker with `admit`, `record`, `track`, `configure`, `hold` and `held`; its state belongs to the tracker object (no module-level state) and a wrong order is `LockOrderError`. `claimRowsSkipLocked(tx, claims, request)` runs a statement from a closed registry the caller wrote; the kit itself exports no lock clause and no session lock. `databaseUrlReason(text, { expectedRole, allowPlainLoopback })` is a strict allow-list check of a database URL and reads no environment variable. The calendar arithmetic and the helpers of `createPool` live in `src/private/lib/PostgreSQL/`. Full reference: `docs/code/lib-postgres.md`.

### File uploads (`files/uploadTempImage`, `files/uploadTempPdf`)

Both files export a function matching their own name: `src/files/uploadTempImage.mts` exports `uploadTempImage` (named `uploadTemp` up to and including 6.0.0), `src/files/uploadTempPdf.mts` exports `uploadTempPdf`.

Pipeline: `storeUploadAsTemp` (writes stream to `/tmp/<uuid>.<ext>`, enforces 5 MB cap) → `validateJpgPngExtension` / `validatePdfExtension` → `validateMimeTypeImages` / `validateMimeTypePdf` (file-type magic-number check) → `scanVirus` (clamscan, requires `initClamScan()` to be called once at boot) → `reEncodeToWebp` (sharp, strips EXIF) for images / passthrough for PDF. NSFW check is commented out (Sightengine integration scaffolded).

Static-file move targets: `UPLOAD_IMG_DIRECTORY_URL = ${cwd}/upload/uimg`, `${STATIC_FOLDER}` from env.

### Email (`SocketLabsLib`)

Class wrapping `@socketlabs/email`, which sends through `createSocketLabsSender` (`src/email/createSocketLabsSender.mts`, 8.0.0): a factory that takes `serverId`, `apiKey` and optional `requestTimeout` (default 120 s), `numberOfRetries` (default 3, 0 to 5), `client`, `onError`, and returns a function that sends one `ISocketLabsMessage` and resolves `{ ok: true }` or `{ ok: false, code }` (`ISocketLabsSendResult`; `code` = the SDK's `result.name`, else `UnknownError`). It reads no environment, loads no Sentry or dotenv and reaches no peer but `@socketlabs/email` (`PEER_BUDGET` in `test/package/peerReach.spec.mts`); the types are `ISocketLabsSenderOptions`, `ISocketLabsMessage`, `ISocketLabsSendResult`, `ISocketLabsClient`. `SocketLabsLib` is env-driven: `SOCKETLABS_SERVER_ID`, `SOCKETLABS_SERVER_APIKEY`, `PLATFORM_NAME`, `APP_DOMAIN`, `EMAIL_FROM`, `DEV_TEAM_EMAIL`. Supplies methods for verify, welcome, account disabled/banned, OTP, password reset confirm, wrong-hash, too-old-link, etc. Copy is hard-coded English (not locale-configurable) and branded with the configured `platformName`. HTML header/footer can be overridden via constructor args. The class is a thin dispatcher: the subject, text and HTML of each mail are built by the modules under `src/private/email/`, and every value placed in the HTML part goes through the single helper `private/email/escapeHtml.mts` (text and attribute context), while the text part and the subject line stay raw. See `docs/code/email.md` and `docs/code/internal.md`.

---

## 5. Environment variables

Loaded ad-hoc per module via the internal `loadEnv()` (`dotenv.config()` when `dotenv` is installed). No single `.env.example` in tree — gather from grep:

| Var | Used by |
|---|---|
| `MONGODB_URI` | `dataSources/MongoDB` |
| `MARIADB_DBNAME` / `_USER` / `_PWD` / `_IP` / `_PORT` / `_RETRY` / `_TIMEOUT` / `_LOGGING` | `dataSources/MariaDB` |
| `POSTGRESQL_USER` / `_PWD` / `_HOST` / `_PORT` / `_DBNAME` / `_POOL_MAX` / `_IDLE_TIMEOUT` | `dataSources/PostgreSQL` |
| `REDIS_URL`, `REDIS_IS_CLUSTER`, `REDIS_DB{1,2,3}_HOST/PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_KEY` | `dataSources/Redis`, middleware, mutations |
| `REDIS_TLS` | `dataSources/Redis` via `private/dataSources/{isRedisTlsRequired,redisNodeUrl,resolveRedisUrl}` — exactly `true` requires the `rediss://` scheme, anything else is off |
| `INTROSPECTION_CODE` | middleware (bypass auth for schema introspection; inert unless `NODE_ENV` is `development`/`test`) |
| `NODE_ENV` | `tdwKoaErrorHandler` (Sentry capture only in dev), `lib/isIntrospectionBypassAllowed` (allowlist `development`/`test` gating the introspection bypass) |
| `SOCKETLABS_SERVER_ID`, `SOCKETLABS_SERVER_APIKEY`, `PLATFORM_NAME`, `APP_DOMAIN`, `EMAIL_FROM`, `DEV_TEAM_EMAIL` | `SocketLabsLib` |
| `STATIC_FOLDER` | `moveFileStaticDomain` |

Sentry is reached through the internal `private/lib/sentry` facade (`captureException`, `captureMessage`, `withScope` of `@sentry/node`, or no-ops when it is not installed); project relies on the consumer to call `Sentry.init()`.

---

## 6. Conventions

- **Indent:** tabs (`.editorconfig`: `indent_style=tab`, `tab_width=2`).
- **Prettier:** no semicolons, single quotes, `trailingComma:none`, `printWidth:129`.
- **ESLint:** extends `@axiumine/eslint-config-be`.
- **File extension:** `.mts` for source. Imports use `.mjs` extension explicitly (NodeNext requires it).
- **Naming:** `IFoo` for interfaces, `TFoo` for type aliases, `FooType` for `GraphQLObjectType`s, `throwFoo` for error throwers, `handleIfFoo` for guard predicates.
- **Module shape:** one named export per file, file name matches export. `mutations/X.mts` exports a plain object with `description`, `type`, `args`, `resolve` ready to drop into a `GraphQLObjectType` `fields`.
- **Mongo transactions:** `mongoose.startSession()` + `session.withTransaction(...)` + `endSession()` in `finally`. Always pass the `session` to all model calls.
- **Errors:** never `throw new Error('...')` inside business logic — always go through a `throw*Error()` helper. Internal-only fatal paths use `throwInternalError()`.
- **Tests:** `test/` mirrors `src/` layout (160 `*.spec.mts` files, 173 `.mts` files total), plus one property-based spec, `test/property/inputHandling.spec.ts` (`.ts` on purpose: the OpenSSF Scorecard Fuzzing check scans only `*.ts`/`*.tsx`; it uses `fast-check`). Run via Mocha (`.mocharc.json`, two spec globs: `dist-test/**/*.spec.mjs`, the `build:tests` output of `test/`, and `scripts/**/*.spec.mts`, the 4 colocated specs of the caps tooling loaded straight from source), with sinon + chai + `mongodb-memory-server`. Coverage via c8 (`.c8rc.json`): `check-coverage`, `per-file`, and all four metrics (`lines`/`statements`/`functions`/`branches`) at 100. `.githooks/pre-commit` runs, in this order, the `yarn.lock` registry check (always), `yarn -s check:static`, `yarn test:coverage` and Qodana, on every commit touching `src/`, `test/`, `scripts/`, `package.json`, `.c8rc.json`, `.mocharc.json`, a `tsconfig*.json`, `eslint.config.js`, `eslint-suppressions.json`, `knip.config.js`, `fta.json` or `.code-caps-baseline.json`; docs-only commits skip every heavy step. `.githooks/pre-push` re-runs `check:static` and the Semgrep scan and canaries then `yarn ratchet:against` on the merge base with `origin/main`, on a push that touches the same paths plus `.semgrep/` and `.github/workflows/semgrep.yml`. Three zero-dependency snapshot specs pin the public surface: `test/package/publicApi.spec.mts` (the `exports` map against `dist/` plus runtime symbol names, snapshot `test/__snapshots__/public-api.json`) and `test/graphQL/throw/errorCatalog.spec.mts` (every `throwXxx` status, title and description, snapshot `test/__snapshots__/graphql-errors.json`, cross-checked against `docs/code/graphql-errors.md`) and `test/package/peerReach.spec.mts` (a static walk of built `dist/` from every `exports` key: which subpaths load which peer at import, lazily, or in types only; snapshot `test/__snapshots__/peer-reach.json`). Regenerate on an intentional change only: `UPDATE_SNAPSHOT=1 yarn test`, then read the diff.

---

## 7. Versioning & release

- License: `GPL-3.0-or-later`.
- Repo: <https://github.com/Axiumine/koa-utils>.
- Current version: `7.2.0` (`package.json`). Bump version, merge to `main`, then publish a GitHub release `vX.Y.Z`:
  `.github/workflows/release.yml` publishes to npm with provenance (no token stored). `yarn upload` is the manual
  fallback and needs the token in `.npmrc`; use one path per version, never both.
- **Publishing:** `yarn upload` pins `--registry=https://registry.npmjs.org/` on purpose. Yarn 1 exports the registry from
  `.yarnrc` to child processes as `npm_config_registry`, so a bare `npm publish` run through `yarn` targets the local
  Verdaccio mirror instead of npmjs. On a maintainer machine that fails with `ENEEDAUTH` against `yarnproxy.gio.lan`;
  on a machine authenticated to the mirror it would publish there silently. The CLI flag outranks the injected env var.
- `CHANGELOG.md` (root) tracks every release back to `3.8.0`, Keep a Changelog format. Update it in the same commit as the version bump.
- **Publish surface:** `files` is `["dist", "!dist/**/*.mjs.map", "!dist/**/*.js.map"]`. The negations matter —
  `tsconfig.json` sets `"inlineSources": true`, so every emitted map embeds the complete original `.mts` as
  `sourcesContent`, `src/private/**` included. The build still writes them, so local `--enable-source-maps` debugging
  is unaffected; they just do not ship. `npm pack --dry-run` must report zero `.map` files.
- `peerDependencies` covers every runtime lib, 19 entries. Each carries an upper bound and no floor (`"redis": "<7"`,
  `"mongoose": "<10"`); `keygrip` keeps its own `^1.1.0`. A floor would assert a minimum never tested here and would
  warn consumers whose install worked yesterday, so ranges only ever close the top end. Set the bound at the major
  above whichever is higher, the version this repo builds against or the current release on npm — deriving it from
  `devDependencies` alone shipped a bound one major too low for `graphql` and `redis` in 5.7.1.
  The two ceilings that sit a major above the pinned `devDependencies` are build-verified, not asserted:
  `graphql@17.0.2` and `redis@6.2.0` were each swapped into `node_modules` and put through `yarn test:coverage`
  (786 passing, 100% on all four metrics, `declaration: true` + `skipLibCheck: false`) before the range was written.
  `redis` stayed swapped in and is now the pinned devDependency; `graphql` was restored to `16.x`, which is what every
  consumer runs — `@apollo/server@5` peers `^16.11.0` and no Apollo release supports 17 yet.
  Library declares zero `dependencies` — consumer must install peers. All 18 are `optional` in
  `peerDependenciesMeta` (8.0.0; `uuid` left the list, tokens use `node:crypto`) because no barrel exists and each is
  reachable only through subpaths the consumer opts into. That holds only while it stays true — a root `"."`
  export, or an import of a peer from a module every subpath reaches, makes it a hard requirement again.
  `@sentry/node` and `dotenv` are reached by many subpaths, so they load through the private facades
  `private/lib/sentry.mts` and `private/lib/loadEnv.mts`, which skip them when absent. The exact reach per peer is
  `test/__snapshots__/peer-reach.json`, pinned by `test/package/peerReach.spec.mts`.

---

## 8. Known quirks / gotchas

- `tokenOptions.secure = false` — must be flipped via Nginx / proxy in production. Comment on line 8 calls this out.
- `setLoginCookies` only writes `refresh_token`. The access token is delivered in the GraphQL response body (`LoginType.accessToken`) and stored client-side (header use).
- `verifySignedRefreshToken` returns `refresh:<uuid>` (prefix included). The full Redis key is `${REDIS_KEY}refresh:<uuid>`.
- `authenticatedResourceHandler` Bearer prefix check is strict: must start with `Bearer access:`. Refresh-token check is `verifySignedRefreshToken`.
- `accessTokenExpiry()` returns a random number in [30, 90] minutes — by design, jitters token lifetime. Don't replace with a constant unless you know why.
- `tdwKoaErrorHandler` only calls `Sentry.captureException` on non-GraphQL errors and only in `NODE_ENV=development` — production Sentry coverage relies on inner `tryCatchRethrow` and `Sentry.captureException` calls inside individual modules.
- `emailChangeHashVerify` currently returns `false` instead of throwing on "email not found" (`@fixme throw` comment, line 54).
- `updatePassword` enforces a 60-min reset link window (`DateLib.minElapsed(dt1) > 60`). `resetPwd` enforces 10-min throttle.
- `signUp` sends an email even when the user already exists ("already valid" notice) to avoid leaking account presence — but then throws 409, so a side-channel oracle still exists via timing.
- Private modules under `src/private/` reach into `@models/*` and DB collections — consumers should not import them directly.
- `private/graphQL/models/MongoDB/private/UserAdminKoaUtils.mts` defines the admin user model used by `loginAdmin` (not exported).
- `account.disabled`/`account.deleted` are `Boolean` on the documents but **strings** in the Redis session hash (`redData?.disabled`, truthy for `'true'` and `'false'` alike). `disabled` was wrongly `type: String` on the documents through 5.0.3 — legacy rows need `scripts/migrate-account-disabled-to-boolean.mjs`, because `.lean()` reads never cast.
- `tryCatchRethrow` casts `e` to `GraphQLError | Error` but receives `unknown` from `catch (e: unknown)` — relies on `instanceof` narrowing.

---

## 9. Tooling around the repo

- `CLAUDE.md` (root) — repo-wide agent rules: gates, publish policy, doc-sync map, commit style. Nested per-area `CLAUDE.md` files (see §1, plus `.github/CLAUDE.md` for CI, runner policy, release pipeline and deprecation, and `.githooks/CLAUDE.md` for the Qodana gate, mutation gate and npm proxy rules) carry the local conventions and pitfalls and are read only when that directory is touched. All of them are written in "caveman ultra" style to cut agent context cost; root Rule 0 requires the `caveman:caveman` skill (marketplace `JuliusBrussee/caveman`) to be invoked before any `CLAUDE.md` is edited. The same style applies to comments inside `test/**/*.mts` (rules in `test/CLAUDE.md`); `describe`/`it` description strings and directive comments are excluded, and every other doc — plus every comment under `src/` — stays normal prose.
- `scripts/caveman-gate.sh` — machine enforcement for both rules, wired as two `PreToolUse` hooks in `.claude/settings.json`. The `Skill` matcher records that `caveman:caveman` was invoked in the session; the `Write|Edit` matcher denies writes to any file named `CLAUDE.md`, and to any `.mts` file under `test/`, when the skill is either missing or not yet invoked, and prints the install command. Fails closed. Escape hatch `SKIP_CAVEMAN_GATE=1`, owner only.
- `.githooks/` — `commit-msg` (Conventional Commits, 150 characters, banned words), `pre-commit` (lockfile host check, `yarn -s check:static`, `yarn test:coverage`, Qodana, in that order) and `pre-push` (new; `yarn -s check:static`, `yarn -s ratchet:against` on the merge base with `origin/main`, `scripts/semgrep.sh`, `scripts/semgrep-canary.sh`, then `yarn mutation:changed` on the `src/**/*.mts` files the push changes, about 35 seconds per file). `pre-push` skips branch deletes and docs-only ranges, fails closed when yarn, `node_modules`, the `stryker` and `patch-package` binaries, python3, docker, the daemon or the pinned Semgrep image (`SEMGREP_IMAGE`, read from `.github/workflows/semgrep.yml`) is missing, prints one fixing command and never pulls an image. It needs no network: both Semgrep scripts pass `--disable-version-check` and the hook runs no registry packs. It also fails closed when `origin/main` is not known locally (`git fetch origin main`). A push that only changes `.semgrep/` or the Semgrep workflow runs the gates too, so a narrowed rule meets the canaries; pre-commit does not list those paths because no pre-commit gate runs Semgrep. No `SKIP_*` variable on either hook except the existing `SKIP_QODANA`.
- `.nvmrc` — Node major (`24`) for `nvm use` and for tools that read it. Yarn 1 stays the package manager; there is no `packageManager` field.
- `tsconfig.check.json` — `typecheck` gate only: extends `tsconfig.json`, `noEmit`, adds `exactOptionalPropertyTypes`, and sets `skipLibCheck: true` because the `sequelize` declaration files report two errors that cannot be fixed here. `tsconfig.json` keeps `skipLibCheck: false` for the published `.d.mts`.
- `tsconfig.scripts.json` — `typecheck:scripts` gate for `scripts/**/*.mts`: Node runs those files directly (type stripping), so only erasable syntax and real `.mts` import extensions are allowed.
- `tsconfig.tests.json` — `typecheck:tests` gate for the spec suite (`test/**/*.mts`, `test/**/*.ts`): extends `tsconfig.check.json`, so specs meet the same strict flags as `src/`. `rootDirs` (`dist`, `src`) lets a spec's relative `../dist/x.mjs` import resolve to `src/` when `dist/` does not exist, so the gate needs no build first (CI runs it before the build). It is not the mocha build (`tsconfig.build-tests.json`, `noCheck`) and not the editor config (`tsconfig.test.json`).
- `eslint.config.js` — typed `strictTypeChecked` on `src/**/*.mts`, plus `sonarjs`, `security` (every rule forced to `error`) and the size and complexity budget as errors; a `scripts/` block for the tooling. `eslint-suppressions.json` — ESLint bulk suppressions: the remaining typed-lint debt as a per-file, per-rule count that can only shrink. Never hand-edit; see `CONTRIBUTING.md`.
- `knip.config.js` — Knip entries derived from the `package.json` `exports` map (`dist/X.mjs` back to `src/X.mts`) plus specs and `scripts/`. `ignoreDependencies` lists only the packages Knip cannot see being used (`mariadb`, `mongodb`, `typescript-transform-paths`, `@types/keygrip`, `keygrip`).
- `fta.json` — FTA config, `score_cap` 50. No file scores above 50 today (highest: `dataSources/PostgreSQL` 49.4, `updatePassword` 48.9, `emailChangeHashVerify` 48.0; `SocketLabsLib` was split into `src/private/email/` and now scores 13.6), so the cap holds today's code and blocks anything worse. It was 64 until `SocketLabsLib`, `updatePassword` and `emailChangeHashVerify` were refactored.
- `.code-caps-baseline.json`, `scripts/check-code-caps.mts`, `scripts/code-caps/` — code-size ratchet. Caps over code lines only (blank and comment-only lines excluded): file 500, function 50, class 300, parameters 4, nesting 4. The baseline lists the violations that exist today: 2 entries, the `sendEmailVerify` and `sendEmailReset` parameter counts (5) of `SocketLabsLib`; the class itself measures 120 code lines, under the 300 cap; a new, grown or stale entry fails `yarn caps`. `yarn caps:update` only lowers values and drops entries, `--accept` rewrites the whole file (owner, review the diff). `cli.mts` is the driver, `measure.mts` the pure measurement (and the syntax check), `ratchet.mts` the comparison with the baseline, `against.mts` the comparison of both ratchet files with a git ref (`--against`), `errors.mts` the exit-2 error type; each has a colocated `*.spec.mts`, included in `.c8rc.json` so they stay at 100% coverage.
- `scripts/leak-check.mts` — leak tripwire behind `yarn leak:check`: runs stateless scenarios (pure helpers, `sharp` re-encode, bcrypt) against the built `dist/` and fails when the heap or external memory keeps growing after a forced gc. A measurement tool like `scripts/semgrep.sh`: outside the c8 include, no spec.
- `stryker.config.json`, `scripts/mutation-build.sh`, `scripts/mutation-changed.sh` — StrykerJS mutation testing (`yarn mutation`, `yarn mutation:changed`). Config: Mocha runner, TypeScript checker, per-test coverage analysis, incremental results in `reports/stryker-incremental.json`, sandbox mode (`inPlace: false`, the working tree is never rewritten), mutate set mirroring the `.c8rc.json` excludes. `mutation-build.sh` is the sandbox build (clean, `build:esm`, `build:tests`; it links `node_modules` itself because Stryker runs the build before linking). Outputs `.stryker-tmp/` and `reports/` are gitignored. Reading the report and the disable policy: `CONTRIBUTING.md`.
- `patches/` — `patch-package` patches applied by `yarn mutation` and the mutation workflow only (never an install script: the package is published). Today one patch, `@stryker-mutator+mocha-runner+10.1.1.patch`, which lets the Stryker Mocha runner load Mocha 12. Not published (`files` ships `dist/`, `LICENSE`, `README.md`, `package.json`). Removal steps: `TODO.md`.
- `TODO.md` — dated maintainer reminders; today: recheck Stryker upstream for Mocha 12 and drop the patch.
- `test/package/`, `test/__snapshots__/`, `test/graphQL/throw/errorCatalog.spec.mts`, `test/helpers/snapshot.mts` — the public API and error-catalog snapshot specs and their writer (see section 6).
- `AGENTS.md` and the `<!-- gitnexus:start -->` block in `CLAUDE.md` are generated by `yarn reindex` — never hand-edited.
- `.claude/skills/`, `.agents/skills/` — Claude Code / Agent SDK scaffolding.
- `skills-lock.json` — pinned skill manifest.
- `z-ram.sh` — local helper script (RAM tweak, not part of library).
- `deploy-local.sh` — maintainer-only. Builds, then rsyncs `dist/` into every consumer's `node_modules/@axiumine/koa-utils` inside one workspace, so an unpublished version can be exercised against the real services first. `npm publish` is a one-way door; this is not a release step and touches nothing outside the local machine.
- `scripts/registry-rewrite.mjs` — behind `yarn registry:mirror|canonical|check`. Rewrites the host of the registry tarball `resolved` URLs in `yarn.lock` between `https://registry.npmjs.org` and the mirror in `REGISTRY_MIRROR`, so a maintainer behind a private mirror never commits its host. Nothing runs automatically; a plain clone is untouched. Replaced the git clean/smudge filter, whose hardcoded default host `prepare` installed on every clone.
- `scripts/migrate-account-disabled-to-boolean.mjs` — one-shot data migration for consumers. Rewrites `account.disabled`/`account.deleted` from string to boolean in the `user` and `userAdmin` collections. Dry run unless `--apply`; needs `MONGO_URI`. Required once when upgrading from **5.0.3 or earlier** — see the "Migration required" section in `CHANGELOG.md`.
- `CODEOWNERS` — owners `@giovannimanzoni` and `@vivi7` (backup owner).
- `LICENSE` — the canonical GPL-3.0 text with nothing prepended, so GitHub's license detection reports `GPL-3.0`. The copyright holder is named in `README.md` and `package.json` (`author`). Shipped in the npm tarball.
- `SECURITY.md` — vulnerability reporting policy and supported-versions table (private advisory or email, response targets). Update the table on every major `version` bump.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `GOVERNANCE.md`, `ROADMAP.md` — community files. Not published to npm. `GOVERNANCE.md` names the backup owner and the npm publishing gap, so update it when either changes.
- `.github/ISSUE_TEMPLATE/` (bug report and feature request forms, blank issues off, links to the private advisory form and to `docs/code`), `.github/PULL_REQUEST_TEMPLATE.md` — the checklist mirrors the gates in `CONTRIBUTING.md`.
- `docs/architecture.md` — design overview and key flows. `docs/security.md` — security requirements (R1 to R20), documented limits (L1 to L16), threat model, trust boundaries and known gaps; update it when a trust boundary, a crypto choice or a validation rule changes. `docs/verify-release.md` — how to check a signed tag, rebuild the tarball and verify a build attestation; it holds the signing-key fingerprint.
- `.github/workflows/` — GitHub Actions, all with top-level `permissions: contents: read` and every third-party action pinned by commit SHA with a `# vX.Y.Z` comment. `ci.yml`, `qodana.yml`, `semgrep.yml` and `mutation.yml` run on the self-hosted pool (`runs-on: [self-hosted, Linux, X64]`); `release.yml` and `scorecard.yml` stay on `ubuntu-24.04`. The runner rules are in the agent rule file.
  - `ci.yml` — job `Scope` first (see `.github/actions/scope/` below): on a pull request that changes only documentation, `Test coverage`, `Test coverage (Node 26.13.0)` and Qodana are skipped by a job-level `if`, which still counts as passing for the required check. Every pool job that runs `yarn install` first runs the `.github/actions/public-lockfile` step (see below). Job `Test coverage` (the required check, name unchanged; Node pinned to the `engines` floor `24.14.0`): step `Static gates` (`yarn check:static`, which folds in the old `Coding standard` lint step), `yarn test:coverage` (100% gate), two clean builds must hash identically, and the `npm pack` tarball must hold no `.map`. Job `Test coverage (Node 26.13.0)` (not yet a required check, same pool): Yarn from the Node 24 Corepack because Node 26 ships none, then install plus `yarn test:coverage` on the `^26.13.0` floor of `engines`. Job `Dependency audit`: `yarn audit` gates the shipped dependency groups, the dev tree is only reported. Advisory jobs, not required checks: `Trivy` (digest-pinned image, `fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL --exit-code 1`) and `Leak check` (`yarn leak:check`, schedule and manual dispatch only). Runs on push and PR to `main`, plus a weekly cron. Needs no secret.
  - `qodana.yml` — job `Qodana Ultimate Plus`: `yarn test:coverage`, then the Qodana scan. Needs the `QODANA_TOKEN` secret, so it is skipped on Dependabot PRs.
  - `semgrep.yml` — job `SAST`: `scripts/semgrep-canary.sh` first, then `scripts/semgrep.sh`, then a registry-pack scan (`scripts/semgrep.sh --registry`: `p/typescript`, `p/nodejs`, `p/javascript`, `p/nodejsscan`, `p/secrets`; needs the network, so CI only and never a hook). `SEMGREP_IMAGE` is pinned by tag and digest.
  - `mutation.yml` — job `Mutation testing`: weekly (Sundays 03:43 UTC) and manual dispatch only, 120 minute timeout. Restores and saves the Stryker incremental file with `actions/cache`, runs `yarn mutation`, uploads `reports/mutation/` as an artifact. Advisory, not a required check, `permissions: contents: read`.
  - `release.yml` — three jobs: `Verify and pack` (tests, SAST, `npm pack`), `Publish to npm` (npm trusted publishing with provenance, environment `npm-publish`) and `Attach signed release assets` (tarball plus its `*.intoto.jsonl` attestation on the GitHub release). Runs when a GitHub release is published for a `v*` tag; `workflow_dispatch` is a dry run that stops after `Verify and pack`. Publishing needs the npm trusted publisher, configured on npmjs.com for this file name; until then releases go out with `yarn upload`.
  - `scorecard.yml` — OpenSSF Scorecard analysis: push to `main`, weekly cron, `branch_protection_rule`, manual dispatch. Publishes results to scorecard.dev and uploads SARIF to code scanning.
- `.github/actions/scope/action.yml` — local composite action behind the `Scope` job of `ci.yml` and `qodana.yml`. On a `pull_request` event it diffs `HEAD^1..HEAD` and sets output `code=false` only when every changed file matches an allowlist of documentation paths (`*.md`, `docs/`, `LICENSE`, `CODEOWNERS`, the issue and pull request template folders); every other event, and any other file, gives `code=true`.
- `.github/actions/public-lockfile/action.yml` — local composite action run before every `yarn install` on the self-hosted pool (`ci.yml`, `qodana.yml`, `mutation.yml`). `hooks:install` used to write the maintainer's `yarnlock-registry` clean/smudge filter into the persistent runner workspace, and a later checkout then rewrote `yarn.lock` to the LAN proxy host, which a runner outside the LAN (the Hetzner one) cannot resolve. The filter is gone from the repo, but a workspace that ran an older commit can still hold it. The action removes the filter config, overwrites `yarn.lock` with the raw committed blob (`git checkout` would skip a smudged file whose stat data still matches the index), and fails if any `resolved` URL is not on `registry.npmjs.org`, which also catches a foreign host written by Dependabot.
- `.github/dependabot.yml` — weekly version updates: npm (devDependencies only, `versioning-strategy: increase`, minor and patch grouped) and `github-actions`. Every package that is also a `peerDependency` is ignored for semver-major bumps (also semver-minor for the 0.x ones, `reflect-metadata` and `sharp`, because Dependabot counts only 1.0 and above as major), and `keygrip` is ignored whole. This lowers the chance that a dev bump touches a peer range or builds against a major the range never claimed, but it only filters what Dependabot proposes and is not a guarantee: read the `package.json` lines of every Dependabot PR. A new peer in `package.json` needs a matching `ignore` entry. Dependabot cannot bump `SEMGREP_IMAGE`, the `qodana.yaml` `linter:` tag or the `--linter` arg in `qodana.yml`: those stay manual.
