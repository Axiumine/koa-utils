# @axiumine/koa-utils

TypeScript utility library for Koa + GraphQL backends. Ships authentication middleware, GraphQL error helpers, data-source connectors (MongoDB, MariaDB, PostgreSQL, Redis), file upload pipeline (ClamAV + sharp re-encode), and transactional email via SocketLabs.

- **Module format:** ESM only (`.mjs` + `.d.mts`)
- **Node:** `^24.14.0`
- **TypeScript:** `5.9`
- **License:** GPL-3.0-or-later
- **Maintainer:** [Giovanni Manzoni](https://www.giovannimanzoni.com)

## Install

```bash
yarn add @axiumine/koa-utils
# or
npm install @axiumine/koa-utils
```

All runtime dependencies are declared as **peer dependencies**. Install the ones you use:

```bash
yarn add @node-rs/bcrypt @sentry/node @socketlabs/email clamscan dotenv \
  file-type fs-extra graphql keygrip koa koa-logger mongoose pg redis \
  reflect-metadata sequelize sequelize-typescript sharp uuid
```

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
const keys = new Keygrip([process.env.COOKIE_KEY!])

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
import { uploadTemp } from '@axiumine/koa-utils/files/uploadTempImage'
import { uploadTempPdf } from '@axiumine/koa-utils/files/uploadTempPdf'

await initClamScan()  // once at boot
const { tempFile, ext } = await uploadTemp(filePromise)  // jpg/png → webp
```

Pipeline: stream to `/tmp` (5 MB cap) → extension + magic-number MIME check → ClamAV → sharp re-encode (strips EXIF). PDF path scans only (no re-encode).

### Email

```ts
import { SocketLabsLib } from '@axiumine/koa-utils/email/SocketlabsLib'

const mailer = new SocketLabsLib()
await mailer.sendEmailVerify('user@example.com', hash)
```

> Note: copy is Italian. Subclass / replace template methods for other locales.

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
| `INTROSPECTION_CODE` | Bypass header `x-introspectioncode` for schema introspection |
| `SOCKETLABS_SERVER_ID`, `SOCKETLABS_SERVER_APIKEY` | SocketLabs auth |
| `PLATFORM_NAME`, `APP_DOMAIN`, `EMAIL_FROM`, `DEV_TEAM_EMAIL` | Email templating |
| `STATIC_FOLDER` | Destination for `moveFileStaticDomain` |
| `NODE_ENV` | `development` enables extra Sentry capture in the error handler |

Each module calls `dotenv.config()` at import time.

## TLS / cookies

`tokenOptions` sets `secure: false` by design. Flip it at the reverse proxy (Nginx / Caddy / CloudFront), not in source.

## Build (contributors only)

```bash
yarn install
yarn build        # ESM only — production output
yarn build:all    # ESM + CJS dual output
yarn lint         # eslint --fix + prettier --write
yarn clean
```

Source files are `.mts`. Imports use `.mjs` extension explicitly (NodeNext). Path aliases (`@lib/*`, `@throw/*`, `@models/*`, `@context/*`, `@stypes/*`, `@private/*`, `@email/*`, `@dataSources/*`) are rewritten to relative paths in emitted code via `typescript-transform-paths` (run through `tspc`, the `ts-patch` wrapper).

Adding a new public symbol requires both:
1. Creating `src/<area>/<Name>.mts`
2. Adding the matching entry under `exports` in `package.json`

There is no barrel and no `main` / `module` field.

## Repository

<https://github.com/Axiumine/koa-utils>

## License

GPL-3.0-or-later © Giovanni Manzoni
