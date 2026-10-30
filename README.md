# @axiumine/koa-utils

[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Axiumine/koa-utils/badge)](https://scorecard.dev/viewer/?uri=github.com/Axiumine/koa-utils)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/16094/badge)](https://www.bestpractices.dev/projects/16094)

TypeScript utility library for Koa + GraphQL backends. Ships authentication middleware, GraphQL error helpers, data-source connectors (MongoDB, MariaDB, PostgreSQL, Redis), file upload pipeline (ClamAV + sharp re-encode), and transactional email via SocketLabs.

- **Module format:** ESM only (`.mjs` + `.d.mts`)
- **Node:** `^24.14.0`
- **TypeScript:** `6.0`
- **License:** GPL-3.0-or-later
- **Maintainer:** [Giovanni Manzoni](https://www.giovannimanzoni.com)
- **Project:** [Contributing](https://github.com/Axiumine/koa-utils/blob/main/CONTRIBUTING.md) · [Governance](https://github.com/Axiumine/koa-utils/blob/main/GOVERNANCE.md) · [Roadmap](https://github.com/Axiumine/koa-utils/blob/main/ROADMAP.md) · [Security policy](https://github.com/Axiumine/koa-utils/blob/main/SECURITY.md) · [Code of Conduct](https://github.com/Axiumine/koa-utils/blob/main/CODE_OF_CONDUCT.md) · [Changelog](https://github.com/Axiumine/koa-utils/blob/main/CHANGELOG.md)

## Install

```bash
yarn add @axiumine/koa-utils
# or
npm install @axiumine/koa-utils
```

All runtime dependencies are declared as **peer dependencies** — the package ships zero `dependencies`, so the consuming project owns every installed version.

Seven are required. The auth core — sign-up, the login variants, refresh, logout, the middleware, the models and the error helpers — reaches all of them:

```bash
yarn add @node-rs/bcrypt @sentry/node dotenv graphql mongoose redis uuid
```

The remaining twelve are declared **optional** in `peerDependenciesMeta`. There is no barrel export: each of these is reachable only through subpaths you opt into by importing them, so a project that never imports the subpath never loads the package, and npm/yarn will not warn about the missing peer. Install the row when you import the subpath:

| Optional peer | Required by |
|---|---|
| `@socketlabs/email` | `email/SocketLabsLib`, `lib/access/createResetPwdFlow`, `lib/access/createVerifyEmailFlow`, `lib/access/resetPwdMailer`, `lib/access/verifyEmailMailer`, `koa/router/verifyEmail`, and the `signUp` / `login*` / `resetPwd` / `updatePassword` / `emailChangeHashVerify` mutations |
| `clamscan` | `files/scanVirus`, `files/uploadTempImage`, `files/uploadTempPdf` |
| `file-type` | `files/validateMimeType`, `files/validateMimeTypeImages`, `files/validateJpgPngMimeType`, `files/uploadTempImage`, `files/uploadTempPdf` — loaded lazily, at first call |
| `fs-extra` | the `files/move*` and `files/validate*` helpers, `files/uploadTempImage`, `files/uploadTempPdf` |
| `keygrip` | `koa/middleware/authenticatedAuthorizationHandler`, `.../verifySignedRefreshToken`, `koa/middleware/authenticatedLogoutHandler` — types only; the `Keygrip` instance is yours to construct and pass in |
| `koa` | the `koa/middleware/*` handlers, `koa/tdwKoaErrorHandler`, `koa/logRequestToDb` — types only (`Next`) |
| `mariadb` | `dataSources/MariaDB` — Sequelize connects with `dialect: 'mariadb'` and loads the driver itself |
| `pg` | `dataSources/PostgreSQL` |
| `reflect-metadata` | `dataSources/MariaDB` — required by `sequelize-typescript`, never imported by this package |
| `sequelize` | `dataSources/MariaDB` — peer of `sequelize-typescript` |
| `sequelize-typescript` | `dataSources/MariaDB` |
| `sharp` | `files/reEncodeToJpeg`, `files/reEncodeToPng`, `files/reEncodeToWebp`, `files/uploadTempImage` |

Optionality is a promise about the load path, not a way to silence the warning: it holds only while the dependency stays behind a subpath the consumer opts into. Adding a root `"."` barrel, or importing one of these from a module that every subpath reaches, breaks it for every consumer at once.

## Quick start

A Koa app that refuses every request without a valid access token and answers with the caller's id. It needs a MongoDB and a Redis server you can reach.

```bash
yarn add @axiumine/koa-utils @node-rs/bcrypt @sentry/node dotenv graphql mongoose redis uuid koa
printf 'MONGODB_URI=mongodb://localhost:27017/app\nREDIS_URL=redis://localhost:6379\nREDIS_KEY=app:\n' > .env
```

Save this as `server.mts`:

```ts
import 'dotenv/config'
import Koa from 'koa'
import { MongoDBConnect } from '@axiumine/koa-utils/dataSources/MongoDB'
import { RedisConnect } from '@axiumine/koa-utils/dataSources/Redis'
import { tdwKoaErrorHandler } from '@axiumine/koa-utils/koa/tdwKoaErrorHandler'
import { authenticatedResourceHandler } from '@axiumine/koa-utils/koa/middleware/authenticatedResourceHandler'

await MongoDBConnect()
await RedisConnect()

const app = new Koa()
app.use(tdwKoaErrorHandler)
app.use(authenticatedResourceHandler())
app.use(async (ctx) => {
	ctx.body = { userId: String(ctx.state.user.id) }
})
app.listen(3000)
```

Run it with `node server.mts` (an ES module project, `"type": "module"`, Node `^24.14.0`, which strips the types itself). `curl -i localhost:3000` answers `412 Precondition Failed` ("No authorization header."): a request needs `Authorization: Bearer access:<uuid>` with a token that exists in Redis. To obtain one, add the `signUp` and `loginRememberme` mutations from [Usage](#usage) to your GraphQL schema and follow the [Auth flow](#auth-flow).

## Usage

No barrel — import each helper from its explicit subpath.

### Data sources

```ts
import { MongoDBConnect, MongoDBDisconnect } from '@axiumine/koa-utils/dataSources/MongoDB'
import { redisClient, RedisConnect } from '@axiumine/koa-utils/dataSources/Redis'
import { pgPool, PostgreSQLClientConnect } from '@axiumine/koa-utils/dataSources/PostgreSQL'
import { sequelize, MariaDBConnect } from '@axiumine/koa-utils/dataSources/MariaDB'

await MongoDBConnect()
await RedisConnect()
```

### Koa middleware

```ts
import Koa from 'koa'
import Keygrip from 'keygrip'
import { tdwKoaErrorHandler } from '@axiumine/koa-utils/koa/tdwKoaErrorHandler'
import { authenticatedResourceHandler } from '@axiumine/koa-utils/koa/middleware/authenticatedResourceHandler'
import { authenticatedAuthorizationHandler } from '@axiumine/koa-utils/koa/middleware/authenticatedAuthorizationHandler'

const app = new Koa()
// Keygrip signs with HMAC-SHA1 unless told otherwise: pass 'sha256'.
// Koa signs the refresh cookie with app.keys, so verify with that same instance.
const keys = new Keygrip([process.env.COOKIE_KEY!], 'sha256')
app.keys = keys

app.use(tdwKoaErrorHandler)
app.use(authenticatedResourceHandler())                // resource endpoints
app.use(authenticatedAuthorizationHandler(keys))       // refresh endpoint
```

### GraphQL mutations

Plain mutation definitions ready to drop into a `GraphQLObjectType`:

```ts
import { GraphQLObjectType } from 'graphql'
import { signUp } from '@axiumine/koa-utils/graphQL/schema/mutations/signUp'
import { loginRememberme } from '@axiumine/koa-utils/graphQL/schema/mutations/loginRememberme'
import { logout } from '@axiumine/koa-utils/graphQL/schema/mutations/logout'
import { refresh } from '@axiumine/koa-utils/graphQL/schema/mutations/refresh'
import { resetPwd } from '@axiumine/koa-utils/graphQL/schema/mutations/resetPwd'
import { updatePassword } from '@axiumine/koa-utils/graphQL/schema/mutations/updatePassword'

const Mutation = new GraphQLObjectType({
	name: 'Mutation',
	fields: { signUp, loginRememberme, logout, refresh, resetPwd, updatePassword }
})
```

### Access flows on your own model

The mutations above are bound to this package's `UserBase` model (collection `user`, fields under `login.*` / `account.*`). If your accounts live elsewhere, build the same flows against your own model and field layout instead:

```ts
import { createResetPwdFlow } from '@axiumine/koa-utils/lib/access/createResetPwdFlow'
import { createVerifyEmailFlow } from '@axiumine/koa-utils/lib/access/createVerifyEmailFlow'

const { resetPwd, updatePassword } = createResetPwdFlow({
	model: Account,
	paths: {
		email: 'mail',
		password: 'pwd',
		name: 'profile.fullName',
		resetDateReq: 'resetPwd.resetDateReq',
		resetHash: 'resetPwd.resetHash',
		deleted: 'state.gone', // a set flag makes the reset answer exactly as it does for an unknown address
		disabled: 'state.locked',
		resetClear: ['resetPwd'] // paths to $unset — a container, not its members, on a strict subdocument
	}
})

const verify = createVerifyEmailFlow({
	model: Account,
	paths: { email: 'mail', valid: 'verified' },
	onAbandon: 'soft-delete', // 'delete' (default) | 'soft-delete' | 'keep'
	deletedValue: () => new Date() // what 'soft-delete' writes; default true
})
router.get('/check/verify-email/:email/:hash', verify.routerVerifyEmail())
```

Every `paths` key is optional and falls back to the `UserBase` layout, so the package-level exports are exactly these factories with no overrides. See [docs/code/lib-access.md](https://github.com/Axiumine/koa-utils/blob/main/docs/code/lib-access.md).

`onAbandon` decides what the two disposal guards — the fifth wrong hash and a link older than 3 days — do to a pending registration. The default `'delete'` removes the row; use `'soft-delete'` or `'keep'` when other collections depend on it, since mongo has no cascade, or pass `deleteUserByEmail` to replace the writer outright. The link is rejected either way.

Guard notifications are debounced per address per template (15 minutes) so an unauthenticated `GET /check/verify-email/…` cannot be looped into a mail bomb aimed at a registered address. Pass `mailThrottle` for a different window or a Redis-backed one, `mailThrottle: ALWAYS_MAIL` to opt out, or `mailer` to replace the sender entirely (any object with the six `IVerifyEmailMailer` methods).

### GraphQL error helpers

```ts
import { throwForbiddenError } from '@axiumine/koa-utils/graphQL/throw/throwForbiddenError'
import { throwNotFoundError } from '@axiumine/koa-utils/graphQL/throw/throwNotFoundError'
import { throwTooManyRequestsError } from '@axiumine/koa-utils/graphQL/throw/throwTooManyRequestsError'

if (!user) throw throwNotFoundError()
```

All `throw*` helpers wrap `throwGraphQLError(status, title, description)` and yield a `GraphQLError` carrying `extensions.http.status` so `tdwKoaErrorHandler` maps it to the right HTTP code.

### File uploads

```ts
import { initClamScan } from '@axiumine/koa-utils/files/scanVirus'
import { uploadTempImage } from '@axiumine/koa-utils/files/uploadTempImage'
import { uploadTempPdf } from '@axiumine/koa-utils/files/uploadTempPdf'

await initClamScan()  // once at boot
const { tempFile, ext } = await uploadTempImage(filePromise)  // jpg/png → webp
```

Pipeline: stream to `/tmp` (5 MB cap) → extension + magic-number MIME check → ClamAV → sharp re-encode (strips EXIF). PDF path scans only (no re-encode).

### Email

```ts
import { SocketLabsLib } from '@axiumine/koa-utils/email/SocketLabsLib'

const mailer = new SocketLabsLib()
await mailer.sendEmailVerify('user@example.com', hash)
```

> Note: copy is hard-coded English and branded with `PLATFORM_NAME`. Subclass / replace template methods for other locales.

### Helpers

```ts
import { encryptPassword } from '@axiumine/koa-utils/lib/encryptPassword'
import { compareHashAsync } from '@axiumine/koa-utils/lib/hash'
import { checkEmailLen } from '@axiumine/koa-utils/lib/checkEmailLen'
import { checkPwdLen } from '@axiumine/koa-utils/lib/checkPwdLen'
import { generateAccessToken, generateRefreshToken, accessTokenExpiry, REFRESH_TOKEN_EXPIRY } from '@axiumine/koa-utils/lib/tokens'
import { setLoginCookies } from '@axiumine/koa-utils/lib/setLoginCookies'
import { DateLib } from '@axiumine/koa-utils/lib/DateLib'
import { StringLib } from '@axiumine/koa-utils/lib/StringLib'
```

## Auth flow

1. `signUp` — creates a user with `account.email.valid=false`, sends verify email.
2. `routerVerifyEmail` — Koa router validating the email + hash, enabling the account.
3. `loginRememberme` / `login4Ever` / `loginAdmin` — bcrypt compare, generate uuid `access:<uuid>` + `refresh:<uuid>` in Redis, set signed `refresh_token` cookie (90 d), return access token in body.
4. `authenticatedResourceHandler` — middleware reading `Authorization: Bearer access:<uuid>`.
5. `authenticatedAuthorizationHandler(keys)` — middleware verifying signed refresh cookie via Keygrip; mount before the `refresh` endpoint.
6. `refresh` — rotates both tokens, random access TTL in [30, 90] minutes, fixed 90-day refresh TTL.
7. `logout` + `authenticatedLogoutHandler` — clears Redis keys and cookie.

## Environment variables

| Var | Purpose |
| --- | --- |
| `MONGODB_URI` | Mongo connection string |
| `MARIADB_DBNAME`, `_USER`, `_PWD`, `_IP`, `_PORT`, `_RETRY`, `_TIMEOUT`, `_LOGGING` | MariaDB |
| `POSTGRESQL_USER`, `_PWD`, `_HOST`, `_PORT`, `_DBNAME`, `_POOL_MAX`, `_IDLE_TIMEOUT` | PostgreSQL |
| `REDIS_URL` or `REDIS_IS_CLUSTER` + `REDIS_DB{1,2,3}_HOST/PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD` | Redis |
| `REDIS_KEY` | Prefix for all keys (e.g. `myapp:`) |
| `REDIS_TLS` | Set to exactly `true` to require TLS: cluster nodes are built as `rediss://` and a non-`rediss://` `REDIS_URL` refuses to boot (see below). Any other value, unset included, keeps the previous plaintext behaviour |
| `INTROSPECTION_CODE` | Bypass header `x-introspectioncode` for schema introspection — **only honoured when `NODE_ENV` is `development` or `test`** (see below) |
| `SOCKETLABS_SERVER_ID`, `SOCKETLABS_SERVER_APIKEY` | SocketLabs auth |
| `PLATFORM_NAME`, `APP_DOMAIN`, `EMAIL_FROM`, `DEV_TEAM_EMAIL` | Email templating |
| `STATIC_FOLDER` | Destination for `moveFileStaticDomain` |
| `NODE_ENV` | `development` enables extra Sentry capture in the error handler. Also gates the introspection bypass: `development` and `test` are the only values that let `x-introspectioncode` skip authentication |

Each module calls `dotenv.config()` at import time.

### Introspection bypass and `NODE_ENV` (6.0.0)

`x-introspectioncode` skips authentication in `authenticatedResourceHandler`, `authenticatedAuthorizationHandler` and `authenticatedLogoutHandler`. Up to 5.9.0 it did so under **every** `NODE_ENV`. From 6.0.0 the bypass is refused unless `process.env.NODE_ENV` is exactly `development` or `test` — the check runs before `INTROSPECTION_CODE` is read, so a correct secret and a correct header still fail everywhere else.

The gate is an allowlist, not `NODE_ENV !== 'production'`, so unset, empty, `Production`, `prod` and `staging` all refuse. A mislabelled environment loses a development convenience rather than opening authentication.

The predicate ships as a public export so consumers can drop their own copy:

```ts
import { isIntrospectionBypassAllowed } from '@axiumine/koa-utils/lib/isIntrospectionBypassAllowed'

if (isIntrospectionBypassAllowed()) {
	// mount the introspection-friendly route
}
```

### Redis TLS — the `REDIS_TLS` flag

`REDIS_TLS` is opt-in and off by default: with the variable unset, `redisClient` connects exactly as it did before the flag existed, so upgrading changes nothing for an existing deployment.

Set it to the **exact** string `true` to require TLS. The match is deliberately exact — `TRUE`, `1`, `yes` and `on` are all read as *off*, because the alternatives (`Boolean(process.env.REDIS_TLS)`, `!== 'false'`) would force TLS on operators who wrote `false` or wrote nothing at all.

| | `REDIS_TLS` unset / any other value | `REDIS_TLS=true` |
| --- | --- | --- |
| Single client (`REDIS_URL`) | `REDIS_URL` used as-is, whatever its scheme | `REDIS_URL` **must** use the `rediss://` scheme, or the module throws at import time |
| Cluster (`REDIS_IS_CLUSTER=1`) | root nodes built as `redis://host:port`, `defaults.socket.tls` is `false` | root nodes built as `rediss://host:port`, `defaults.socket.tls` is `true` |

The single-client path fails closed rather than rewriting the scheme for you. A silent upgrade from `redis://` to `rediss://` would hide the misconfiguration until the TLS handshake failed, against a host that may not be the one you meant; refusing at startup turns it into one unmissable error instead. The three messages it can throw are:

```
[Redis] REDIS_TLS is enabled but REDIS_URL is not set — a rediss:// URL is required.
[Redis] REDIS_TLS is enabled but REDIS_URL is not a valid URL — a rediss:// URL is required.
[Redis] REDIS_TLS is enabled but REDIS_URL uses scheme "redis:" — rediss:// required.
```

The scheme is compared through `new URL().protocol`, the same way node-redis compares it, so an upper-case `REDISS://cache:6379` is accepted.

For the cluster path the `rediss://` scheme on `rootNodes` is not enough on its own: node-redis uses `rootNodes` only to discover the topology and does not inherit their TLS setting for the connections it then opens to the discovered nodes. `defaults.socket.tls` is what actually carries TLS across the cluster, and it is set from the same flag.

## TLS / cookies

`tokenOptions` sets `secure: false` by design. Flip it at the reverse proxy (Nginx / Caddy / CloudFront), not in source.

## Build (contributors only)

```bash
yarn install
yarn build        # ESM only — production output
yarn build:all    # ESM + CJS dual output
yarn test         # build + build:tests + mocha, no coverage gate
yarn test:coverage  # same under c8: fails below 100% on lines, statements, functions or branches of any file
yarn lint         # eslint --fix + prettier --write
yarn lint:check   # eslint + prettier --check, writes nothing (runs in CI)
yarn clean
```

Source files are `.mts`. Imports use `.mjs` extension explicitly (NodeNext). Path aliases (`@lib/*`, `@throw/*`, `@models/*`, `@context/*`, `@stypes/*`, `@private/*`, `@email/*`, `@dataSources/*`) are rewritten to relative paths in emitted code via `typescript-transform-paths` (run through `tspc`, the `ts-patch` wrapper).

Adding a new public symbol requires both:
1. Creating `src/<area>/<Name>.mts`
2. Adding the matching entry under `exports` in `package.json`

There is no barrel and no `main` / `module` field.

### Registry

`yarn.lock` always resolves against `https://registry.npmjs.org/`, so a plain clone installs with no extra setup.

Maintainers who install through a private npm mirror should not commit its host: a git clean/smudge filter rewrites the `resolved` URLs in both directions, keeping the mirror in the working copy and the public registry in history. `yarn install` configures it (via `prepare` → `hooks:install`); point it at your own mirror with `YARN_PROXY_REGISTRY`. A pre-commit check rejects any lockfile that still names a non-public host.

## Feedback, contributing and security

- **Bugs and feature requests:** open an issue at <https://github.com/Axiumine/koa-utils/issues/new/choose>. Issues are public and searchable.
- **Contributing code:** fork, branch from `main` and open a pull request; larger changes start with an issue. [CONTRIBUTING.md](https://github.com/Axiumine/koa-utils/blob/main/CONTRIBUTING.md) lists the requirements (tests at 100% coverage, docs in the same change, Conventional Commits, GPL-3.0-or-later). How decisions are made is in [GOVERNANCE.md](https://github.com/Axiumine/koa-utils/blob/main/GOVERNANCE.md); the direction is in [ROADMAP.md](https://github.com/Axiumine/koa-utils/blob/main/ROADMAP.md).
- **Security vulnerabilities:** never in a public issue. Use GitHub private vulnerability reporting or the email in [SECURITY.md](https://github.com/Axiumine/koa-utils/blob/main/SECURITY.md), which also states the supported versions and response times.
- **Security model and design:** what the library does and does not protect against is in [docs/security.md](https://github.com/Axiumine/koa-utils/blob/main/docs/security.md); the structure is in [docs/architecture.md](https://github.com/Axiumine/koa-utils/blob/main/docs/architecture.md). How to check a release (signed tag, rebuild, attestation) is in [docs/verify-release.md](https://github.com/Axiumine/koa-utils/blob/main/docs/verify-release.md).
- **Release notes:** [CHANGELOG.md](https://github.com/Axiumine/koa-utils/blob/main/CHANGELOG.md), one entry per release, with a `Security` section whenever a release fixes a vulnerability.

## Repository

<https://github.com/Axiumine/koa-utils>

## License

GPL-3.0-or-later © Giovanni Manzoni
