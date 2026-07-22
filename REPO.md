# @axiumine/koa-utils

A TypeScript utility library for Koa-based backends authored by Giovanni Manzoni / Axiumine. Bundles authentication, GraphQL error handling, data-source connectors (MongoDB, MariaDB, PostgreSQL, Redis), file upload pipelines, transactional email (SocketLabs), and reusable middleware.

Distributed on npm as ESM-only (`.mjs`) with `.d.mts` declarations. Node `^24.14.0`, TypeScript `6.0`.

---

## 1. Layout

```
src/
├── dataSources/      # Connect/disconnect helpers for Mongo, MariaDB, PostgreSQL, Redis
├── email/            # SocketLabsLib — transactional email client (hard-coded copy)
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
│   ├── tdwKoaErrorHandler.mts   # Top-level Koa error middleware
│   ├── logRequestToDb.mts       # Request timing/log middleware
│   ├── IFileUpload.mts          # graphql-upload-compatible shape
│   └── IKoaError.mts
├── lib/
│   ├── Constants.mts           # OBJECTID_0_*, EMAIL_MAX_LEN, MIN/MAX_PWD_LENGTH (10/72 OWASP bcrypt), EMAIL_HASH_LEN
│   ├── tokens.mts              # uuid v4 access/refresh + accessTokenExpiry (30–90 min random)
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
│   ├── isSafeRedirectTarget.mts # allow-lists `/x/...` redirect targets
│   ├── isSessionBlocked.mts    # true when a Redis session is disabled/deleted
│   ├── isValidUuidV4.mts       # uuid v4 shape check
│   ├── ArrayLib / DateLib / NumLib / StringLib  # static utility classes
│   ├── IAuthorizationDisDel.mts
│   ├── makeOnboardingData.mts
│   ├── MariaDB/                # IMariaDBErr, MariaDBErrType, throwSqlErrors
│   ├── MongoDB/                # IMongoDBError, MongoDBErrType, throwIfMongoErr, throwMongoErrors, IOnboarding
│   ├── PostgreSQL/             # IPostgresError, IPostgresErrorCodes, makePostgreSqlLogError
│   ├── Redis/                  # buildPrefixedRedisKey, RedisBoolean enum + to/from helpers
│   ├── db/
│   │   ├── log/                # hitStat, logGlobalError, logGraphql, logThrow
│   │   ├── login/              # ILoginSet, ILoginUnset
│   │   ├── registerNewUser.mts
│   │   └── userExist.mts
└── private/          # Internal helpers — NOT exported via package.json
    ├── files/_validateMimeType.mts, reEncode.mts
    ├── graphQL/Consts.mts, schema/{context,mutations}/
    └── lib/access/{db/*, handleIf*}
```

`types/` directory exists but is empty / placeholder.

---

## 2. Build & publish

| Script | Action |
|---|---|
| `yarn build` | clean + `build:esm` only — production target |
| `yarn build:all` | `build:cjs` + `build:esm` for dual format |
| `yarn build:esm` | `tspc -p tsconfig.json`, rename `.js` → `.mjs`, flatten `dist/esm/*` → `dist/` |
| `yarn build:cjs` | `tsc -p tsconfig.cjs.json`, rename `.js` → `.cjs`, flatten `dist/cjs/*` → `dist/` |
| `yarn build:tests` | `tspc -p tsconfig.build-tests.json` into `dist-test/`, rename `.js` → `.mjs` |
| `yarn prepare` | `hooks:install` + `rm -rf dist && yarn build` — runs on `npm install` |
| `yarn prepare:all` | `rm -rf dist && yarn build:all` |
| `yarn hooks:install` | `git config core.hooksPath .githooks` (no-op outside a git repo) |
| `yarn lint` | `eslint --fix` + `prettier --write 'src/**/*.mts'` |
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

`tsconfig.json` highlights: `target: ES2023`, `module: NodeNext`, `strict: true`, `declaration: true`, `outDir: ./dist/esm`, `declarationDir: ./dist/esm`. `tsconfig.cjs.json` mirrors for CJS output.

---

## 3. Package exports

`package.json` enumerates 143 explicit subpath exports — no barrel, no root entry. Consumers import deep paths:

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
4. **`authenticatedResourceHandler`** middleware: reads `Authorization: Bearer access:<uuid>` header, looks up `${REDIS_KEY}access:<uuid>` in Redis (`hGetAll`); blocks if `disabled` or `deleted` flag in session; populates `ctx.state.user`. Falls back to allowing through if `x-introspectioncode` matches `INTROSPECTION_CODE` env.
5. **`authenticatedAuthorizationHandler(keys: Keygrip)`** middleware: verifies signed `refresh_token` cookie via `Keygrip.index()`, looks up `${REDIS_KEY}refresh:<uuid>`, populates `ctx.state.user`. Used to authorise `refresh` mutation only.
6. **`refresh`** mutation: rotates both tokens, writes new Redis keys with `accessTokenExpiry()` (random 30–90 min) and `REFRESH_TOKEN_EXPIRY` (90 d) TTLs, deletes old refresh entry.
7. **`logout`** + `authenticatedLogoutHandler`: deletes refresh + (optional) access Redis keys, clears cookie.

### Errors

`throwGraphQLError(status, title, desc)` wraps `new GraphQLError(title, { extensions: { http: { status }, description } })`. Every `throw*` helper in `graphQL/throw/` is a thin wrapper with a fixed HTTP code + title. `tdwKoaErrorHandler` is the top-level Koa middleware that catches, sets `ctx.status` from `extensions.http.status`, sets `ctx.body = { message, description }` (skipped for 100/101/102/204/205/304), and emits `'error'` on the app. `customFormatErrorFn` is the formatter passed to graphql-http / koa-graphql.

`tryCatchRethrow(e)` is the standard `.catch` body inside every mutation: forwards Mongo errors via `throwIfMongoErr` (turns `DuplicateKeyError` into 409, `[Validator]` prefix into 400), re-throws GraphQL errors verbatim, captures the rest to Sentry and throws `throwInternalError()`.

### Data sources

Each connector reads `.env` via `dotenv.config()` at import time. Functions are `*Connect()` / `*Disconnect()` async; connection objects (`sequelize`, `pgClient`, `pgPool`, `redisClient`) are exported as module-level singletons. `MongoDB` uses `mongoose.connect(process.env.MONGODB_URI)` with `sanitizeFilter: true`, `strictQuery: false`, `family: 4` (IPv4), `serverSelectionTimeoutMS: 5000`, `autoIndex: true`.

`redisClient` supports cluster mode when `REDIS_IS_CLUSTER === '1'` (3 nodes from `REDIS_DB{1,2,3}_HOST/PORT`); otherwise single via `REDIS_URL`.

### File uploads (`files/uploadTempImage`, `files/uploadTempPdf`)

Note the file/symbol mismatch: `src/files/uploadTempImage.mts` exports a function named `uploadTemp`, not `uploadTempImage` — `uploadTempImage` is only the file name / `package.json` export path (`./files/uploadTempImage`). `src/files/uploadTempPdf.mts` exports `uploadTempPdf`, matching its file name.

Pipeline: `storeUploadAsTemp` (writes stream to `/tmp/<uuid>.<ext>`, enforces 5 MB cap) → `validateJpgPngExtension` / `validatePdfExtension` → `validateMimeTypeImages` / `validateMimeTypePdf` (file-type magic-number check) → `scanVirus` (clamscan, requires `initClamScan()` to be called once at boot) → `reEncodeToWebp` (sharp, strips EXIF) for images / passthrough for PDF. NSFW check is commented out (Sightengine integration scaffolded).

Static-file move targets: `UPLOAD_IMG_DIRECTORY_URL = ${cwd}/upload/uimg`, `${STATIC_FOLDER}` from env.

### Email (`SocketLabsLib`)

Single class wrapping `@socketlabs/email`. Env-driven: `SOCKETLABS_SERVER_ID`, `SOCKETLABS_SERVER_APIKEY`, `PLATFORM_NAME`, `APP_DOMAIN`, `EMAIL_FROM`, `DEV_TEAM_EMAIL`. Supplies methods for verify, welcome, account disabled/banned, OTP, password reset confirm, wrong-hash, too-old-link, etc. Copy is hard-coded English (not locale-configurable) and branded with the configured `platformName`. HTML header/footer can be overridden via constructor args.

---

## 5. Environment variables

Loaded ad-hoc per module via `dotenv.config()`. No single `.env.example` in tree — gather from grep:

| Var | Used by |
|---|---|
| `MONGODB_URI` | `dataSources/MongoDB` |
| `MARIADB_DBNAME` / `_USER` / `_PWD` / `_IP` / `_PORT` / `_RETRY` / `_TIMEOUT` / `_LOGGING` | `dataSources/MariaDB` |
| `POSTGRESQL_USER` / `_PWD` / `_HOST` / `_PORT` / `_DBNAME` / `_POOL_MAX` / `_IDLE_TIMEOUT` | `dataSources/PostgreSQL` |
| `REDIS_URL`, `REDIS_IS_CLUSTER`, `REDIS_DB{1,2,3}_HOST/PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_KEY` | `dataSources/Redis`, middleware, mutations |
| `INTROSPECTION_CODE` | middleware (bypass auth for schema introspection) |
| `NODE_ENV` | `tdwKoaErrorHandler` (Sentry capture only in dev) |
| `SOCKETLABS_SERVER_ID`, `SOCKETLABS_SERVER_APIKEY`, `PLATFORM_NAME`, `APP_DOMAIN`, `EMAIL_FROM`, `DEV_TEAM_EMAIL` | `SocketLabsLib` |
| `STATIC_FOLDER` | `moveFileStaticDomain` |

Sentry is referenced by `@sentry/node`; project relies on the consumer to call `Sentry.init()`.

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
- **Tests:** `test/` mirrors `src/` layout (118 `*.spec.mts` files, 120 `.mts` files total). Run via Mocha (`.mocharc.json`, spec glob `dist-test/**/*.spec.mjs`) against the `build:tests` output, with sinon + chai + `mongodb-memory-server`. Coverage via c8 (`.c8rc.json`): `check-coverage`, `per-file`, and all four metrics (`lines`/`statements`/`functions`/`branches`) at 100. `.githooks/pre-commit` runs `yarn test:coverage` on every commit touching `src/`, `test/`, `package.json`, `.c8rc.json`, `.mocharc.json` or a `tsconfig*.json`.

---

## 7. Versioning & release

- License: `GPL-3.0-or-later`.
- Repo: <https://github.com/Axiumine/koa-utils>.
- Current version: `5.0.3` (`package.json`). Bump version → `yarn upload` → token in `.npmrc` is required.
- **Publishing:** `yarn upload` pins `--registry=https://registry.npmjs.org/` on purpose. Yarn 1 exports the registry from
  `.yarnrc` to child processes as `npm_config_registry`, so a bare `npm publish` run through `yarn` targets the local
  Verdaccio mirror instead of npmjs. On a maintainer machine that fails with `ENEEDAUTH` against `yarnproxy.gio.lan`;
  on a machine authenticated to the mirror it would publish there silently. The CLI flag outranks the injected env var.
- `CHANGELOG.md` (root) tracks every release back to `3.8.0`, Keep a Changelog format. Update it in the same commit as the version bump.
- `peerDependencies` covers every runtime lib (`@node-rs/bcrypt`, `@sentry/node`, `@socketlabs/email`, `clamscan`, `dotenv`, `file-type`, `fs-extra`, `graphql`, `keygrip`, `koa-logger`, `mongoose`, `pg`, `redis`, `reflect-metadata`, `sequelize`, `sequelize-typescript`, `sharp`, `uuid`). Library declares zero `dependencies` — consumer must install peers.

---

## 8. Known quirks / gotchas

- `tokenOptions.secure = false` — must be flipped via Nginx / proxy in production. Comment on line 8 calls this out.
- `setLoginCookies` only writes `refresh_token`. The access token is delivered in the GraphQL response body (`LoginType.accessToken`) and stored client-side (header use).
- `verifySignedRefreshToken` returns `refresh:<uuid>` (prefix included). The full Redis key is `${REDIS_KEY}refresh:<uuid>`.
- `authenticatedResourceHandler` Bearer prefix check is strict: must start with `Bearer access:`. Refresh-token check is `verifySignedRefreshToken`.
- `accessTokenExpiry()` returns a random number in [30, 90] minutes — by design, jitters token lifetime. Don't replace with a constant unless you know why.
- `tdwKoaErrorHandler` only calls `Sentry.captureException` on non-GraphQL errors and only in `NODE_ENV=development` — production Sentry coverage relies on inner `tryCatchRethrow` and `Sentry.captureException` calls inside individual modules.
- `emailChangeHashVerify` currently returns `false` instead of throwing on "email not found" (`@fixme throw` comment, line 40).
- `updatePassword` enforces a 60-min reset link window (`DateLib.minElapsed(dt1) > 60`). `resetPwd` enforces 10-min throttle.
- `signUp` sends an email even when the user already exists ("already valid" notice) to avoid leaking account presence — but then throws 409, so a side-channel oracle still exists via timing.
- Private modules under `src/private/` reach into `@models/*` and DB collections — consumers should not import them directly.
- `private/graphQL/models/MongoDB/private/UserAdminKoaUtils.mts` defines the admin user model used by `loginAdmin` (not exported).
- `tryCatchRethrow` casts `e` to `GraphQLError | Error` but receives `unknown` from `catch (e: unknown)` — relies on `instanceof` narrowing.

---

## 9. Tooling around the repo

- `.idea/` — JetBrains config in tree.
- `.claude/skills/`, `.agents/skills/` — Claude Code / Agent SDK scaffolding.
- `skills-lock.json` — pinned skill manifest.
- `z-ram.sh` — local helper script (RAM tweak, not part of library).
- `CODEOWNERS` — single owner `@giovannimanzoni`.
