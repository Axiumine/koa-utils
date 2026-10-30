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
│   ├── logRequestToDb.mts       # Request pass-through middleware (no-op)
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
│   ├── PostgreSQL/             # IPostgresError, IPostgresErrorCodes, makePostgreSqlLogError
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
```

`src/types/` holds one ambient declaration, `socketlabs-email.d.ts` (`declare module '@socketlabs/email'`, which ships no types); it emits no `.mjs`.

Area-scoped agent rules live in nested `CLAUDE.md` files, loaded on demand when an agent touches that directory: `src/graphQL/`, `src/koa/`, `src/lib/access/`, `src/private/`, `src/email/`, `src/files/`, `test/`. Repo-wide rules stay in the root `CLAUDE.md`. Not shipped — `files: ["dist"]`.

Outside `src/`: `docs/code/` is the per-area reference (index `docs/code/README.md`); `docs/architecture.md`, `docs/security.md` and `docs/verify-release.md` are the design, the security model and the release verification pages; the community and policy files sit at the repo root (see section 9). The npm tarball holds `dist/` plus `package.json`, `README.md` and `LICENSE` only, so the `README.md` links to repo files are absolute GitHub URLs.

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
| `yarn hooks:install` | `git config core.hooksPath .githooks` (no-op outside a git repo); picks up every hook in the directory, `pre-push` included |
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

`tsconfig.json` highlights: `target: ES2023`, `module: NodeNext`, `strict: true`, `declaration: true`, `outDir: ./dist/esm`, `declarationDir: ./dist/esm`. `tsconfig.cjs.json` mirrors for CJS output.

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

`throwGraphQLError(status, title, desc)` wraps `new GraphQLError(title, { extensions: { http: { status }, description } })`. Every `throw*` helper in `graphQL/throw/` is a thin wrapper with a fixed HTTP code + title. `tdwKoaErrorHandler` is the top-level Koa middleware that catches, sets `ctx.status` from `extensions.http.status`, sets `ctx.body = { message, description }` (skipped for 100/101/102/204/205/304), and emits `'error'` on the app. `customFormatErrorFn` is the formatter passed to graphql-http / koa-graphql.

`tryCatchRethrow(e)` is the standard `.catch` body inside every mutation: forwards Mongo errors via `throwIfMongoErr` (turns `DuplicateKeyError` into 409, `[Validator]` prefix into 400), re-throws GraphQL errors verbatim, captures the rest to Sentry and throws `throwInternalError()`.

### Data sources

Each connector reads `.env` via `dotenv.config()` at import time. Functions are `*Connect()` / `*Disconnect()` async; connection objects (`sequelize`, `pgClient`, `pgPool`, `redisClient`) are exported as module-level singletons. `MongoDB` uses `mongoose.connect(process.env.MONGODB_URI)` with `sanitizeFilter: true`, `strictQuery: false`, `family: 4` (IPv4), `serverSelectionTimeoutMS: 5000`, `autoIndex: true`.

`redisClient` supports cluster mode when `REDIS_IS_CLUSTER === '1'` (3 nodes from `REDIS_DB{1,2,3}_HOST/PORT`); otherwise single via `REDIS_URL`.

Both paths take their scheme from `REDIS_TLS`, via the three `private/dataSources/` helpers. Set to exactly `true` it builds cluster root nodes as `rediss://` **and** sets `defaults.socket.tls` (node-redis does not inherit root-node TLS for the connections it opens to discovered nodes), and it requires `REDIS_URL` to carry the `rediss:` scheme — `resolveRedisUrl` throws at module load otherwise, rather than upgrading the scheme silently. Any other value, unset included, is off and keeps the pre-flag plaintext behaviour. See `docs/code/data-sources.md` and `docs/code/internal.md`.

### File uploads (`files/uploadTempImage`, `files/uploadTempPdf`)

Both files export a function matching their own name: `src/files/uploadTempImage.mts` exports `uploadTempImage` (named `uploadTemp` up to and including 6.0.0), `src/files/uploadTempPdf.mts` exports `uploadTempPdf`.

Pipeline: `storeUploadAsTemp` (writes stream to `/tmp/<uuid>.<ext>`, enforces 5 MB cap) → `validateJpgPngExtension` / `validatePdfExtension` → `validateMimeTypeImages` / `validateMimeTypePdf` (file-type magic-number check) → `scanVirus` (clamscan, requires `initClamScan()` to be called once at boot) → `reEncodeToWebp` (sharp, strips EXIF) for images / passthrough for PDF. NSFW check is commented out (Sightengine integration scaffolded).

Static-file move targets: `UPLOAD_IMG_DIRECTORY_URL = ${cwd}/upload/uimg`, `${STATIC_FOLDER}` from env.

### Email (`SocketLabsLib`)

Single class wrapping `@socketlabs/email`. Env-driven: `SOCKETLABS_SERVER_ID`, `SOCKETLABS_SERVER_APIKEY`, `PLATFORM_NAME`, `APP_DOMAIN`, `EMAIL_FROM`, `DEV_TEAM_EMAIL`. Supplies methods for verify, welcome, account disabled/banned, OTP, password reset confirm, wrong-hash, too-old-link, etc. Copy is hard-coded English (not locale-configurable) and branded with the configured `platformName`. HTML header/footer can be overridden via constructor args. The class is a thin dispatcher: the subject, text and HTML of each mail are built by the modules under `src/private/email/`, and every value placed in the HTML part goes through the single helper `private/email/escapeHtml.mts` (text and attribute context), while the text part and the subject line stay raw. See `docs/code/email.md` and `docs/code/internal.md`.

---

## 5. Environment variables

Loaded ad-hoc per module via `dotenv.config()`. No single `.env.example` in tree — gather from grep:

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
- **Tests:** `test/` mirrors `src/` layout (134 `*.spec.mts` files, 140 `.mts` files total), plus one property-based spec, `test/property/inputHandling.spec.ts` (`.ts` on purpose: the OpenSSF Scorecard Fuzzing check scans only `*.ts`/`*.tsx`; it uses `fast-check`). Run via Mocha (`.mocharc.json`, two spec globs: `dist-test/**/*.spec.mjs`, the `build:tests` output of `test/`, and `scripts/**/*.spec.mts`, the 4 colocated specs of the caps tooling loaded straight from source), with sinon + chai + `mongodb-memory-server`. Coverage via c8 (`.c8rc.json`): `check-coverage`, `per-file`, and all four metrics (`lines`/`statements`/`functions`/`branches`) at 100. `.githooks/pre-commit` runs, in this order, the `yarn.lock` registry check (always), `yarn -s check:static`, `yarn test:coverage` and Qodana, on every commit touching `src/`, `test/`, `scripts/`, `package.json`, `.c8rc.json`, `.mocharc.json`, a `tsconfig*.json`, `eslint.config.js`, `eslint-suppressions.json`, `knip.config.js`, `fta.json` or `.code-caps-baseline.json`; docs-only commits skip every heavy step. `.githooks/pre-push` re-runs `check:static` and the Semgrep scan and canaries then `yarn ratchet:against` on the merge base with `origin/main`, on a push that touches the same paths plus `.semgrep/` and `.github/workflows/semgrep.yml`. Two zero-dependency snapshot specs pin the public surface: `test/package/publicApi.spec.mts` (the `exports` map against `dist/` plus runtime symbol names, snapshot `test/__snapshots__/public-api.json`) and `test/graphQL/throw/errorCatalog.spec.mts` (every `throwXxx` status, title and description, snapshot `test/__snapshots__/graphql-errors.json`, cross-checked against `docs/code/graphql-errors.md`). Regenerate on an intentional change only: `UPDATE_SNAPSHOT=1 yarn test`, then read the diff.

---

## 7. Versioning & release

- License: `GPL-3.0-or-later`.
- Repo: <https://github.com/Axiumine/koa-utils>.
- Current version: `7.1.0` (`package.json`). Bump version → `yarn upload` → token in `.npmrc` is required.
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
  Library declares zero `dependencies` — consumer must install peers. Seven are required
  (`@node-rs/bcrypt`, `@sentry/node`, `dotenv`, `graphql`, `mongoose`, `redis`, `uuid`); the other twelve
  (`@socketlabs/email`, `clamscan`, `file-type`, `fs-extra`, `keygrip`, `koa`, `mariadb`, `pg`, `reflect-metadata`,
  `sequelize`, `sequelize-typescript`, `sharp`) are `optional` in `peerDependenciesMeta` because no barrel exists and
  each is reachable only through subpaths the consumer opts into. That holds only while it stays true — a root `"."`
  export, or an import of one of the twelve from a module every subpath reaches, makes it a hard requirement again.

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

- `CLAUDE.md` (root) — repo-wide agent rules: gates, publish policy, doc-sync map, commit style. Nested per-area `CLAUDE.md` files (see §1) carry the local conventions and pitfalls and are read only when that directory is touched. All of them are written in "caveman ultra" style to cut agent context cost; root Rule 0 requires the `caveman:caveman` skill (marketplace `JuliusBrussee/caveman`) to be invoked before any `CLAUDE.md` is edited. The same style applies to comments inside `test/**/*.mts` (rules in `test/CLAUDE.md`); `describe`/`it` description strings and directive comments are excluded, and every other doc — plus every comment under `src/` — stays normal prose.
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
- `scripts/migrate-account-disabled-to-boolean.mjs` — one-shot data migration for consumers. Rewrites `account.disabled`/`account.deleted` from string to boolean in the `user` and `userAdmin` collections. Dry run unless `--apply`; needs `MONGO_URI`. Required once when upgrading from **5.0.3 or earlier** — see the "Migration required" section in `CHANGELOG.md`.
- `CODEOWNERS` — single owner `@giovannimanzoni`.
- `LICENSE` — the canonical GPL-3.0 text with nothing prepended, so GitHub's license detection reports `GPL-3.0`. The copyright holder is named in `README.md` and `package.json` (`author`). Shipped in the npm tarball.
- `SECURITY.md` — vulnerability reporting policy and supported-versions table (private advisory or email, response targets). Update the table on every major `version` bump.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `GOVERNANCE.md`, `ROADMAP.md` — community files. Not published to npm. `GOVERNANCE.md` names the backup owner and the npm publishing gap, so update it when either changes.
- `.github/ISSUE_TEMPLATE/` (bug report and feature request forms, blank issues off, links to the private advisory form and to `docs/code`), `.github/PULL_REQUEST_TEMPLATE.md` — the checklist mirrors the gates in `CONTRIBUTING.md`.
- `docs/architecture.md` — design overview and key flows. `docs/security.md` — security requirements (R1 to R13), documented limits (L1 to L13), threat model, trust boundaries and known gaps; update it when a trust boundary, a crypto choice or a validation rule changes. `docs/verify-release.md` — how to check a signed tag, rebuild the tarball and verify a build attestation; it holds the signing-key fingerprint.
- `.github/workflows/` — GitHub Actions, all with top-level `permissions: contents: read` and every third-party action pinned by commit SHA with a `# vX.Y.Z` comment.
  - `ci.yml` — job `Test coverage` (the required check, name unchanged): step `Static gates` (`yarn check:static`, which folds in the old `Coding standard` lint step), `yarn test:coverage` (100% gate), two clean builds must hash identically, and the `npm pack` tarball must hold no `.map`. Job `Dependency audit`: `yarn audit` gates the shipped dependency groups, the dev tree is only reported. Advisory jobs, not required checks: `Trivy` (digest-pinned image, `fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL --exit-code 1`) and `Leak check` (`yarn leak:check`, schedule and manual dispatch only). Runs on push and PR to `main`, plus a weekly cron. Needs no secret.
  - `qodana.yml` — job `Qodana Ultimate Plus`: `yarn test:coverage`, then the Qodana scan. Needs the `QODANA_TOKEN` secret, so it is skipped on Dependabot PRs.
  - `semgrep.yml` — job `SAST`: `scripts/semgrep-canary.sh` first, then `scripts/semgrep.sh`, then a registry-pack scan (`scripts/semgrep.sh --registry`: `p/typescript`, `p/nodejs`, `p/javascript`, `p/nodejsscan`, `p/secrets`; needs the network, so CI only and never a hook). `SEMGREP_IMAGE` is pinned by tag and digest.
  - `mutation.yml` — job `Mutation testing`: weekly (Sundays 03:43 UTC) and manual dispatch only, 120 minute timeout. Restores and saves the Stryker incremental file with `actions/cache`, runs `yarn mutation`, uploads `reports/mutation/` as an artifact. Advisory, not a required check, `permissions: contents: read`.
  - `release.yml` — three jobs: `Verify and pack` (tests, SAST, `npm pack`), `Publish to npm` (npm trusted publishing with provenance, environment `npm-publish`) and `Attach signed release assets` (tarball plus its `*.intoto.jsonl` attestation on the GitHub release). Runs when a GitHub release is published for a `v*` tag; `workflow_dispatch` is a dry run that stops after `Verify and pack`. Publishing needs the npm trusted publisher, configured on npmjs.com for this file name; until then releases go out with `yarn upload`.
  - `scorecard.yml` — OpenSSF Scorecard analysis: push to `main`, weekly cron, `branch_protection_rule`, manual dispatch. Publishes results to scorecard.dev and uploads SARIF to code scanning.
- `.github/dependabot.yml` — weekly version updates: npm (devDependencies only, `versioning-strategy: increase`, minor and patch grouped) and `github-actions`. Every package that is also a `peerDependency` is ignored for semver-major bumps (also semver-minor for the 0.x ones, `reflect-metadata` and `sharp`, because Dependabot counts only 1.0 and above as major), and `keygrip` is ignored whole. This lowers the chance that a dev bump touches a peer range or builds against a major the range never claimed, but it only filters what Dependabot proposes and is not a guarantee: read the `package.json` lines of every Dependabot PR. A new peer in `package.json` needs a matching `ignore` entry. Dependabot cannot bump `SEMGREP_IMAGE`, the `qodana.yaml` `linter:` tag or the `--linter` arg in `qodana.yml`: those stay manual.
