# Koa — Core Helpers

This section covers the small set of framework-glue pieces every `@axiumine/koa-utils` consumer wires into its Koa + GraphQL stack: the GraphQL error formatter passed to the GraphQL executor, a request-logging middleware, the top-level Koa error-handling middleware, and the two plain interfaces (`IFileUpload`, `IKoaError`) that describe the shapes those pieces (and file-upload resolvers) expect. Together they form the request lifecycle: `tdwKoaErrorHandler` wraps `next()` to catch anything thrown downstream (including GraphQL errors already normalized by `customFormatErrorFn`), while `logRequestToDb` wraps `next()` to log method/url/status/timing around the same call chain.

## `customFormatErrorFn`

**Import:** `import { customFormatErrorFn } from '@axiumine/koa-utils/koa/customFormatErrorFn'`

**Signature:**
```ts
const customFormatErrorFn = (err: GraphQLError | Error) => GraphQLError | Error
```

A GraphQL `formatError`-style function. If `err` is an instance of `GraphQLError`, it **re-throws** a new `GraphQLError` built from `err.message` and `err.extensions` (it does not `return` it). For any other `Error`, it returns the error unchanged. This is intentional: throwing (rather than returning) means the GraphQL executor's formatted error propagates back up through Koa's normal error path so that `tdwKoaErrorHandler` (or an equivalent `try/catch` around `next()`) catches it and can set `ctx.status`/`ctx.body` from `extensions.http.status`. Do not "fix" this to a plain `return` — the throw is load-bearing for the Koa error-handling design.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| err | `GraphQLError \| Error` | The error produced by the GraphQL execution pipeline. |

**Returns:** `GraphQLError | Error` — only reached for non-`GraphQLError` inputs, which are returned as-is.

**Throws:** `GraphQLError` — re-thrown, with the original `message` and `extensions` (e.g. `{ http: { status }, description }` as produced by `throwGraphQLError`), whenever the input is already a `GraphQLError`.

**Notes:** Pair with `tdwKoaErrorHandler` — its `isIstanceOfGQL` branch expects `extensions.http.status` and `extensions.description` to be present, which is exactly the shape `throwGraphQLError` (and this re-throw) preserve.

## `logRequestToDb`

**Import:** `import { logRequestToDb } from '@axiumine/koa-utils/koa/logRequestToDb'`

**Signature:**
```ts
async function logRequestToDb(ctx: IContextLog, next: Next): Promise<void>
```

Koa middleware that logs each request/response pair to `console.debug` and times the request. Before calling `next()`, it logs `"${method} ${url}"`. After `next()` resolves, it computes elapsed milliseconds (`Date.now()` delta), resolves the acting user from `ctx.state.user?.id` (falling back to `OBJECTID_0_OBJ`, the zero `ObjectId` placeholder, when no authenticated user is present), reads `operationName` from `ctx.request.body?.operationName`, and logs `"${status} ${operationName} eseguita da ${user} - ${msTot}ms"`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| ctx | `IContextLog` | Minimal Koa-like context: `{ method, url, state.user.id, request.body?.operationName, status }`. |
| next | `Next` (from `koa`) | The downstream middleware/handler to await. |

**Returns:** `Promise<void>` — resolves after `next()` completes and both log lines have been written.

**Notes:** The commented-out `logGraphql(user, operationName, status, msTot)` call and the `// qui ${ctx.request.body?.operationName} è undefined` comment are intentional live-debugging notes left by the maintainer — do not strip them. `IContextLog` itself lives under `src/private/graphQL/schema/context/IContextLog.mts` and is **not** publicly exported (internal type only); consumers only need the shape it describes when typing their own Koa context.

## `tdwKoaErrorHandler`

**Import:** `import { tdwKoaErrorHandler } from '@axiumine/koa-utils/koa/tdwKoaErrorHandler'`

**Signature:**
```ts
async function tdwKoaErrorHandler(ctx: IContextKoaErrorHandler, next: Next): Promise<void>
```

Top-level Koa error-handling middleware — install it first in the middleware chain so its `try { await next() } catch` wraps everything downstream. On catch:

1. Casts the caught value to `IKoaError` and checks `err instanceof GraphQLError`.
2. Sets `ctx.status`: for GraphQL errors, `errKoa.extensions?.http?.status || 500`; otherwise `errKoa.status || 500`.
3. Skips setting `ctx.body` entirely when `ctx.status` is one of `100, 101, 102, 204, 205, 304` (statuses that must not carry a body).
4. Otherwise sets `ctx.body = { message: errKoa.message }`, and for GraphQL errors additionally sets `ctx.body.description = errKoa.extensions?.description || ''`.
5. When `process.env.NODE_ENV === 'development'` and the error is **not** a GraphQL error, calls `Sentry.captureException(errKoa)` (GraphQL errors are not sent to Sentry in dev mode).
6. Always calls `ctx.app.emit('error', errKoa, ctx)` at the end, regardless of environment or error type.

Loads environment variables via `dotenv.config()` at module scope.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| ctx | `IContextKoaErrorHandler` | Context exposing `status`, `body`, and `app.emit(event, err, ctx)`. |
| next | `Next` (from `koa`) | The downstream middleware chain to run inside the `try` block. |

**Returns:** `Promise<void>` — resolves whether or not an error was caught; errors are handled internally, never re-thrown.

**Notes:** Status codes with a suppressed body: **100, 101, 102, 204, 205, 304**. `IKoaError` (see below) is the internal shape used to read `.status`, `.extensions`, and `.message` off the caught error — it is not exported, so consumers should not rely on importing it directly. Requires `@sentry/node` and `dotenv` as peer dependencies (both declared in `peerDependencies`, not bundled).

## `IFileUpload`

**Import:** `import { IFileUpload } from '@axiumine/koa-utils/koa/IFileUpload'`

**Signature:**
```ts
interface IFileUpload {
	createReadStream: () => NodeJS.ReadableStream
	filename: string
	mimetype: string
	encoding: string
}
```

Describes the shape of a single uploaded file as delivered by a GraphQL multipart/file-upload middleware (e.g. `graphql-upload`-style resolvers): a factory for a readable stream plus the file's original name, MIME type, and transfer encoding. Used as the resolved value of upload-typed GraphQL arguments before the bytes are consumed (e.g. by `storeUploadAsTemp`, `moveTempFile`, or virus/MIME validation helpers elsewhere in the package).

**Notes:** Purely structural — no runtime logic. Consumers implementing a custom upload scalar/middleware should shape the resolved file object to satisfy this interface so the rest of the `files/*` helpers in this package can consume it directly.

## `IKoaError`

**Import:** _internal — not exported_

**Signature:**
```ts
interface IKoaError {
	extensions?: {
		http?: {
			status: number
		}
		description: string
	}
	status?: number
	body: {
		description: string
	}
	message: string
	path: string
	stack: string
}
```

The internal error shape `tdwKoaErrorHandler` casts caught `unknown` errors to before reading `.status`, `.extensions.http.status`, `.extensions.description`, and `.message`. `extensions` mirrors the object built by `throwGraphQLError(status, title, description)` (`{ http: { status }, description }`), so any GraphQL error thrown via that helper satisfies this shape. Non-GraphQL errors only need a `.status` and `.message` for the handler to behave correctly — the other fields (`body`, `path`, `stack`) are typed for completeness but not read by `tdwKoaErrorHandler`.

**Notes:** This file has no entry in `package.json` `exports`, unlike its sibling `IFileUpload`. It is used purely as an internal type annotation inside `tdwKoaErrorHandler.mts`; consumers cannot `import` it from the published package and should not attempt `koa/IKoaError` — that subpath does not exist in `exports`.
