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
- `REDIS_IS_CLUSTER === '1'` → `createCluster({ rootNodes: [...3 nodes...], defaults: { username, password } })`, with root nodes built from `REDIS_DB1_HOST`/`REDIS_DB1_PORT`, `REDIS_DB2_HOST`/`REDIS_DB2_PORT`, `REDIS_DB3_HOST`/`REDIS_DB3_PORT`, and auth from `REDIS_USERNAME` / `REDIS_PASSWORD`.
- otherwise → `createClient({ url: process.env.REDIS_URL })`.

Use `RedisConnect` / `RedisDisconnect` to manage its lifecycle.

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
