# Data Sources

Connect/disconnect helpers for each database engine backing a Koa + GraphQL service: MariaDB (via Sequelize), MongoDB (via Mongoose), PostgreSQL (via `pg`, both a single `Client` and a `Pool`), and Redis (via `redis`, single client or cluster). Each module reads its connection settings from `process.env` at import time (via `dotenv.config()`), constructs and exports the underlying client/handle as a module-level singleton, and exposes one or more `*Connect` / `*Disconnect` async functions to manage the connection lifecycle explicitly — typically called once at process boot and once at graceful shutdown. Connection failures are reported to Sentry and re-thrown as a plain `{ message, shutdown: true }` object so the caller's boot sequence can decide to exit the process.

## `sequelize`

**Import:** `import { sequelize } from '@axiumine/koa-utils/dataSources/MariaDB'`

**Signature:**
```ts
export const sequelize: Sequelize
```

The Sequelize instance for the MariaDB connection, constructed at module load time with `dialect: 'mariadb'`. Queries are configured to return raw results (`query: { raw: true }`). Import this to define/attach models or run queries; call `MariaDBConnect` before using it and `MariaDBDisconnect` when shutting down.

**Notes:** Configured with a connection pool (`max: 13`, `min: 1`, `idle: 10000`, `acquire: 20000`), a retry policy (`backoffBase: 100`, `backoffExponent: 1.1`, `timeout: 3000`, `backoffJitter: 0.1`, `max` retries from `MARIADB_RETRY` or default `5`), and dialect options (`useUTC: true`, `skipSetTimezone: true`, `compress: true`, `requestTimeout` from `MARIADB_TIMEOUT` or default `5000`). Reads env vars `MARIADB_DBNAME`, `MARIADB_USER`, `MARIADB_PWD`, `MARIADB_IP` (host), `MARIADB_PORT`, `MARIADB_RETRY`, `MARIADB_TIMEOUT`, `MARIADB_LOGGING`. Query logging is disabled only when `MARIADB_LOGGING === 'false'`; otherwise Sequelize's default logging behavior applies (`undefined` is passed through, it does not force logging on).

## `MariaDBConnect`

**Import:** `import { MariaDBConnect } from '@axiumine/koa-utils/dataSources/MariaDB'`

**Signature:**
```ts
export const MariaDBConnect = async (): Promise<Sequelize>
```

Authenticates the shared `sequelize` instance against MariaDB (`sequelize.authenticate()`). Logs progress via `console.info`. Call this once at boot before running any query.

**Returns:** `Promise<Sequelize>` — the same `sequelize` instance, resolved once authentication succeeds.

**Throws:** `{ message: '[MariaDB] FAIL: Unable to connect to the database', shutdown: true }` — when `sequelize.authenticate()` rejects; the original error is also sent to Sentry via `Sentry.captureException` before the throw.

**Notes:** The thrown value is a plain object, not an `Error` instance — callers checking `instanceof Error` will not match it. The `shutdown: true` flag signals the boot sequence should terminate the process.

## `MariaDBDisconnect`

**Import:** `import { MariaDBDisconnect } from '@axiumine/koa-utils/dataSources/MariaDB'`

**Signature:**
```ts
export const MariaDBDisconnect = async (): Promise<void>
```

Closes the shared `sequelize` connection (`sequelize.close()`). Call during graceful shutdown.

**Returns:** `Promise<void>`.

**Throws:** `{ message: '[MariaDB] FAIL: Unable to close the database connection: ', shutdown: true }` — when `sequelize.close()` rejects; the original error is sent to Sentry first.

## `MongoDBConnect`

**Import:** `import { MongoDBConnect } from '@axiumine/koa-utils/dataSources/MongoDB'`

**Signature:**
```ts
export async function MongoDBConnect(): Promise<void>
```

Opens the Mongoose default connection to MongoDB using `mongoose.connect(process.env.MONGODB_URI, options)`. Before connecting it sets two global Mongoose flags: `mongoose.set('sanitizeFilter', true)` (guards against NoSQL query-injection via user-supplied filter objects) and `mongoose.set('strictQuery', false)`. Connect options: `family: 4` (force IPv4), `serverSelectionTimeoutMS: 5000`, `autoIndex: true`. Call once at boot before any model operation.

**Returns:** `Promise<void>` — resolves once `mongoose.connect` resolves.

**Notes:** Reads `MONGODB_URI`. There is no dedicated exported client/handle — subsequent code uses Mongoose's default connection (e.g. via `mongoose.model(...)`) directly, since `mongoose` manages a single global connection under the hood. No try/catch here: a rejected `mongoose.connect` call propagates as-is (unlike the MariaDB/PostgreSQL/Redis connect helpers, this one does not wrap failures in a `{ message, shutdown }` object or report to Sentry).

## `MongoDBDisconnect`

**Import:** `import { MongoDBDisconnect } from '@axiumine/koa-utils/dataSources/MongoDB'`

**Signature:**
```ts
export async function MongoDBDisconnect(): Promise<void>
```

Closes the Mongoose default connection (`mongoose.disconnect()`). Call during graceful shutdown.

**Returns:** `Promise<void>`.

**Notes:** No try/catch — a rejection propagates to the caller unwrapped.

## `pgClient`

**Import:** `import { pgClient } from '@axiumine/koa-utils/dataSources/PostgreSQL'`

**Signature:**
```ts
export const pgClient: pg.Client
```

A single, long-lived `pg.Client` instance intended for transactions and single-connection usage. Constructed at module load from `POSTGRESQL_USER`, `POSTGRESQL_PWD`, `POSTGRESQL_HOST`, `POSTGRESQL_PORT`, `POSTGRESQL_DBNAME`. Use `PostgreSQLClientConnect` / `PostgreSQLClientDisconnect` to manage its lifecycle.

## `pgPool`

**Import:** `import { pgPool } from '@axiumine/koa-utils/dataSources/PostgreSQL'`

**Signature:**
```ts
export const pgPool: pg.Pool
```

A connection pool for concurrent query workloads. Constructed at module load from the same `POSTGRESQL_USER` / `POSTGRESQL_PWD` / `POSTGRESQL_HOST` / `POSTGRESQL_PORT` / `POSTGRESQL_DBNAME` env vars, plus `max` (from `POSTGRESQL_POOL_MAX`) and `idleTimeoutMillis` (from `POSTGRESQL_IDLE_TIMEOUT`). Usage pattern (per source comment):

```ts
const pgPoolClient = await pgPool.connect()
// ... queries via pgPoolClient.query('YOUR_QUERY')
pgPoolClient.release()
```

**Notes:** An `error` listener is registered on `pgPool` at module load time (not inside a connect function): on an idle-client backend error, it logs `'Unexpected error on idle client'` and calls `process.exit(-1)` — a network partition or backend error on an idle pooled client will terminate the process. There is no exported `PostgreSQLPoolConnect`; the pool connects lazily per the `pg` library's own behavior — only pool teardown (`PostgreSQLPoolDisconnect`) is exposed here.

## `PostgreSQLClientConnect`

**Import:** `import { PostgreSQLClientConnect } from '@axiumine/koa-utils/dataSources/PostgreSQL'`

**Signature:**
```ts
export const PostgreSQLClientConnect = async (): Promise<void>
```

Connects the shared `pgClient` (`pgClient.connect()`) and, only on first call (guarded via `pgClient.listenerCount(...)`), attaches three listeners:
- `'error'` — logs and reports to Sentry (`Sentry.captureException`) with `catchMex` detail.
- `'notification'` — logs `msg.channel` / `msg.payload` and reports to Sentry via `Sentry.captureMessage` at `'warning'` level (for `LISTEN`/`NOTIFY` use).
- `'notice'` — reports to Sentry via `Sentry.captureMessage` at `'warning'` level (PostgreSQL server notices/warnings).

**Returns:** `Promise<void>`.

**Throws:** `{ message: '[PostgreSQL Client] FAIL: Unable to connect to the database: ' + error, shutdown: true }` — when `pgClient.connect()` (or listener setup) throws.

**Notes:** Reads `POSTGRESQL_USER`, `POSTGRESQL_PWD`, `POSTGRESQL_HOST`, `POSTGRESQL_PORT`, `POSTGRESQL_DBNAME` (via the module-level `pgClient` construction). Listener registration is idempotent — calling `PostgreSQLClientConnect` multiple times will not duplicate listeners.

## `PostgreSQLClientDisconnect`

**Import:** `import { PostgreSQLClientDisconnect } from '@axiumine/koa-utils/dataSources/PostgreSQL'`

**Signature:**
```ts
export const PostgreSQLClientDisconnect = async (): Promise<void>
```

Ends the shared `pgClient` connection (`pgClient.end()`). Call during graceful shutdown.

**Returns:** `Promise<void>`.

**Throws:** `{ message: '[PostgreSQL Client] FAIL: Unable to close the database connection: ' + error, shutdown: true }` — when `pgClient.end()` rejects.

## `PostgreSQLPoolDisconnect`

**Import:** `import { PostgreSQLPoolDisconnect } from '@axiumine/koa-utils/dataSources/PostgreSQL'`

**Signature:**
```ts
export const PostgreSQLPoolDisconnect = async (): Promise<void>
```

Ends the shared `pgPool` (`pgPool.end()`), closing all pooled connections. Call during graceful shutdown.

**Returns:** `Promise<void>`.

**Throws:** `{ message: '[PostgreSQL Pool] FAIL: Unable to close the database connection: ' + error, shutdown: true }` — when `pgPool.end()` rejects.

## `redisClient`

**Import:** `import { redisClient } from '@axiumine/koa-utils/dataSources/Redis'`

**Signature:**
```ts
export const redisClient: RedisClientType | RedisClusterType
```

The shared Redis handle, chosen at module load time based on `REDIS_IS_CLUSTER`:
- `REDIS_IS_CLUSTER === '1'` → `createCluster({ rootNodes: [...3 nodes...], defaults: { username, password, socket } })`, with root nodes built from `REDIS_DB1_HOST`/`REDIS_DB1_PORT`, `REDIS_DB2_HOST`/`REDIS_DB2_PORT`, `REDIS_DB3_HOST`/`REDIS_DB3_PORT`, and auth from `REDIS_USERNAME` / `REDIS_PASSWORD`.
- otherwise → `createClient({ url: resolveRedisUrl(process.env.REDIS_URL) })`.

Use `RedisConnect` / `RedisDisconnect` to manage its lifecycle.

### TLS — the `REDIS_TLS` flag

The connection scheme is configurable. `REDIS_TLS` is read at module load and its only enabling value is
the exact string `'true'`; unset, empty, `'1'`, `'TRUE'` and `'yes'` all leave the client exactly where it
was before the flag existed, so an existing deployment upgrades with no configuration change and no
behaviour change.

| `REDIS_TLS` | Single client (`REDIS_URL`) | Cluster (`REDIS_IS_CLUSTER=1`) |
|---|---|---|
| unset / anything but `'true'` | `REDIS_URL` passed through untouched, `undefined` included | root nodes built as `redis://host:port`, `defaults.socket = { tls: false }` |
| `'true'` | `REDIS_URL` **must** carry the `rediss:` scheme, or module load throws | root nodes built as `rediss://host:port`, `defaults.socket = { tls: true }` |

With the flag on, a `REDIS_URL` that is not `rediss://` is refused rather than silently upgraded. The check
runs in `resolveRedisUrl` before any socket is opened, so the failure is one startup crash naming the
offending scheme instead of a TLS handshake error later against a host nobody meant to change. The scheme is
compared through `new URL()`, which lower-cases the protocol, so `REDISS://cache:6379` is accepted exactly as
node-redis's own `RedisClient.parseURL` accepts it.

**Throws (at import time, `REDIS_TLS=true` only):**

| Condition | Message |
|---|---|
| `REDIS_URL` unset or empty | `[Redis] REDIS_TLS is enabled but REDIS_URL is not set — a rediss:// URL is required.` |
| `REDIS_URL` not parsable by `new URL()` | `[Redis] REDIS_TLS is enabled but REDIS_URL is not a valid URL — a rediss:// URL is required.` |
| scheme is anything but `rediss:` | `` [Redis] REDIS_TLS is enabled but REDIS_URL uses scheme "<protocol>" — rediss:// required. `` |

Note that `defaults.socket` carries the cluster's TLS setting, not the `rediss://` scheme on `rootNodes`.
node-redis uses `rootNodes` only to discover the cluster topology and does **not** inherit their socket
configuration for the connections it then opens to the discovered nodes — setting the scheme alone would
leave every real cluster connection on plaintext. Both are set together for that reason; do not drop
`defaults.socket` on the assumption that the scheme covers it.

The signature above is the readable form. The export carries no type annotation, so the emitted
`dist/dataSources/Redis.d.mts` publishes whatever `createCluster()` / `createClient()` infer — currently
`RedisClusterType<{}, {}, {}, 3, {}> | RedisClientType<{}, {}, {}, 3, {}>`, where the `3` is `redis@6`'s RESP protocol
default (`redis@5` defaulted to RESP 2). Nothing in this package or in any known consumer annotates a variable against
that type — the handle is imported and its methods are called — so the generic is invisible in practice. It is still
published surface: a consumer that writes `const c: RedisClientType<..., 2, ...> = redisClient` would fail to compile,
and the parameter moves on its own whenever the `redis` major moves, without any source change here.

**Notes:** All Redis key conventions elsewhere in this package assume `redisClient` is connected (e.g. keys prefixed with `${process.env.REDIS_KEY}`, refresh tokens under `${REDIS_KEY}refresh:<uuid>`, access tokens under `${REDIS_KEY}access:<uuid>`).

## `RedisConnect`

**Import:** `import { RedisConnect } from '@axiumine/koa-utils/dataSources/Redis'`

**Signature:**
```ts
export const RedisConnect = async (): Promise<void>
```

Attaches an `'error'` listener to `redisClient` (logs `'Redis Client Error'` and reports to Sentry via `Sentry.captureException`), then calls `redisClient.connect()`. Call once at boot.

**Returns:** `Promise<void>`.

**Notes:** Unlike the MariaDB/PostgreSQL connect helpers, this function does not wrap `redisClient.connect()` in a try/catch — a rejected `connect()` call propagates to the caller unwrapped, it is not converted into a `{ message, shutdown }` object.

## `RedisDisconnect`

**Import:** `import { RedisDisconnect } from '@axiumine/koa-utils/dataSources/Redis'`

**Signature:**
```ts
export async function RedisDisconnect(): Promise<void>
```

Gracefully closes the `redisClient` connection (`redisClient.close()`). Call during graceful shutdown.

**Returns:** `Promise<void>`.

**Throws:** Re-throws any error other than the specific "already closed" case (see Notes) after logging and reporting it to Sentry via `Sentry.captureException`.

**Notes:** If `redisClient.close()` rejects with an `Error` whose `message === 'The client is closed'`, this is treated as a no-op success — it logs `'[Redis] Client was already closed'` and returns normally instead of throwing, so calling `RedisDisconnect` on an already-closed client is safe.
