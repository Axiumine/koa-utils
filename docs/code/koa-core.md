# Koa — Core Helpers

This section covers the small set of framework-glue pieces every `@axiumine/koa-utils` consumer wires into its Koa + GraphQL stack: the GraphQL error formatter passed to the GraphQL executor, a request pass-through middleware, the Koa error-handling middleware (`createKoaErrorHandler`, a factory with no peer dependency, and `tdwKoaErrorHandler`, the ready-made GraphQL + Sentry + dotenv version of it), and the plain interfaces (`IFileUpload`, `IKoaError`, `IKoaErrorHandlerOptions`, `IKoaErrorHandlerContext`) that describe the shapes those pieces (and file-upload resolvers) expect. Together they form the request lifecycle: `tdwKoaErrorHandler` wraps `next()` to catch anything thrown downstream (including GraphQL errors already normalized by `customFormatErrorFn`), while `logRequestToDb` wraps `next()` as a no-op placeholder for the per-request logging that was never wired to a database.

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

Koa middleware that awaits `next()` and does nothing else. Through 5.5.0 it timed the request and wrote two `console.debug` lines around `next()` — `"${method} ${url}"` before, and `"${status} ${operationName} executed by ${user} - ${msTot}ms"` after, resolving the acting user from `ctx.state.user?.id` with `OBJECTID_0_OBJ` as fallback. All of that was removed in 5.6.0 along with the timing arithmetic and the `OBJECTID_0_OBJ` import; the intended database sink (`logGraphql`) was never implemented and remains a commented-out marker in the body. The export, its name and its signature are unchanged, so consumers keep working — they simply get no log output.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| ctx | `IContextLog` | Minimal Koa-like context: `{ method, url, state.user.id, request.body?.operationName, status }`. Accepted but no longer read — the type is kept so the middleware can be re-fleshed without a signature change. |
| next | `Next` (from `koa`) | The downstream middleware/handler to await. |

**Returns:** `Promise<void>` — resolves after `next()` completes and both log lines have been written.

**Notes:** The commented-out `logGraphql(user, operationName, status, msTot)` call and the `// qui ${ctx.request.body?.operationName} è undefined` comment are intentional live-debugging notes left by the maintainer — do not strip them. `IContextLog` itself lives under `src/private/graphQL/schema/context/IContextLog.mts` and is **not** publicly exported (internal type only); consumers only need the shape it describes when typing their own Koa context.

## `createKoaErrorHandler`

**Import:** `import { createKoaErrorHandler } from '@axiumine/koa-utils/koa/createKoaErrorHandler'`

**Signature:**
```ts
function createKoaErrorHandler<TCtx extends IKoaErrorHandlerContext = IKoaErrorHandlerContext>(
	options?: IKoaErrorHandlerOptions<TCtx>
): (ctx: TCtx, next: () => Promise<unknown>) => Promise<void>
```

Builds the Koa error middleware with no GraphQL, Sentry or dotenv in it: you decide the status, the body and the reporting. Install the returned function first in the chain. It awaits `next()` in a `try`, and when something throws it runs, in one synchronous `catch` block and in this order:

1. `ctx.status = statusOf(err, ctx)`.
2. If the status **read back from `ctx.status`** is not in `noBodyStatuses`, `body = bodyOf(err, ctx)`; the body is assigned unless it is `undefined`.
3. `report?.(err, ctx)`.
4. `ctx.app.emit('error', err, ctx)`, last, so listeners see the final `ctx`.

It never rethrows what `next()` threw. Reading the status back matters with Koa: its `ctx.status` setter can store a different number than the one assigned (it also clears the body for 204, 205 and 304).

**Options** (all optional, see `IKoaErrorHandlerOptions`):

| Option | Default | Notes |
|---|---|---|
| `statusOf(err, ctx)` | `err?.status \|\| 500` | `\|\|`, not `??`: a status of `0` or `NaN` gives 500. A truthy status outside 100-999 makes Koa's setter assert. |
| `bodyOf(err, ctx)` | `{ message: err?.message }` | Called after the status is set. Returning `undefined` leaves a body set earlier alone; `null`, `''`, `0` and `false` are assigned. |
| `report(err, ctx)` | none | Logging, Sentry, metrics. |
| `noBodyStatuses` | `[100, 101, 102, 204, 205, 304]` | Replaces the default (it does not extend it); `[]` allows a body for every status. Copied into a `Set` when the handler is created, so changing the array afterwards has no effect. |

**Returns:** a function `(ctx, next) => Promise<void>` of two parameters. It resolves whether or not an error was caught.

```ts
import Koa, { ParameterizedContext } from 'koa'
import { createKoaErrorHandler } from '@axiumine/koa-utils/koa/createKoaErrorHandler'

const app = new Koa()

app.use(
	createKoaErrorHandler<ParameterizedContext>({
		statusOf: (err) => (err instanceof SyntaxError ? 400 : 500),
		bodyOf: (_err, ctx) => ({ code: ctx.status === 400 ? 'BAD_INPUT' : 'INTERNAL' }),
		report: (err) => console.error('request failed', err)
	})
)
// With no 'error' listener Koa's own onerror prints err.stack to stderr; register one to take that over:
app.on('error', () => undefined)
```

**Notes:**
- **No peer dependency.** The file imports nothing: importing it loads no environment file, no Sentry, no `graphql` and no `koa` (`koa` only appears as the type you pass for `TCtx`). `test/package/peerReach.spec.mts` pins that for the runtime and for the `.d.mts`.
- The callbacks are not wrapped in `try`/`catch`. A throwing `statusOf` or `bodyOf` rejects the middleware's promise; a throwing `report` rejects it too and skips the `emit`. Guard inside your callback if that matters.
- Unlike `tdwKoaErrorHandler`, a thrown `null`, `undefined`, string or number is handled (status 500, body `{ message: undefined }`) instead of raising a `TypeError`.
- `ctx.app.emit` is called with the exact event name `'error'`, and Koa registers its default `onerror` (which prints the stack) only when the app has no `'error'` listener.
- `tdwKoaErrorHandler` is this factory configured for GraphQL errors, Sentry and dotenv.

## `tdwKoaErrorHandler`

**Import:** `import { tdwKoaErrorHandler } from '@axiumine/koa-utils/koa/tdwKoaErrorHandler'`

**Signature:**
```ts
function tdwKoaErrorHandler(ctx: IContextKoaErrorHandler, next: Next): Promise<void>
```

Top-level Koa error-handling middleware — install it first in the middleware chain so it wraps everything downstream. Since 8.0.0 it is a thin wrapper over `createKoaErrorHandler`, configured with GraphQL-aware `statusOf` and `bodyOf` and a Sentry `report`; its behaviour is unchanged. It is a plain function that returns the factory's promise (not `async`, so it adds no microtask tick), and it keeps its name and its two parameters. It awaits `next()` and, when something throws:

1. Casts the caught value to `IKoaError` and checks `err instanceof GraphQLError`.
2. Sets `ctx.status`: for GraphQL errors, `errKoa.extensions?.http?.status || 500`; otherwise `errKoa.status || 500`.
3. Skips setting `ctx.body` entirely when `ctx.status` is one of `100, 101, 102, 204, 205, 304` (statuses that must not carry a body).
4. Otherwise sets `ctx.body = { message: errKoa.message }`, and for GraphQL errors additionally sets `ctx.body.description = errKoa.extensions?.description || ''`.
5. When `process.env.NODE_ENV === 'development'` and the error is **not** a GraphQL error, calls `Sentry.captureException(errKoa)` (GraphQL errors are not sent to Sentry in dev mode).
6. Always calls `ctx.app.emit('error', errKoa, ctx)` at the end, regardless of environment or error type.

Loads environment variables via the internal `loadEnv()` at module scope (`dotenv.config()` when `dotenv` is installed, nothing otherwise).

**Parameters:**

| Name | Type | Description |
|---|---|---|
| ctx | `IContextKoaErrorHandler` | Context exposing `status`, `body`, and `app.emit(event, err, ctx)`. |
| next | `Next` (from `koa`) | The downstream middleware chain to run inside the `try` block. |

**Returns:** `Promise<void>` — resolves whether or not an error was caught; errors are handled internally, never re-thrown.

**Notes:** Status codes with a suppressed body: **100, 101, 102, 204, 205, 304** (the factory's default `noBodyStatuses`). `IKoaError` (see below) is the shape used to read `.status`, `.extensions`, and `.message` off the caught error; it is also published under `./koa/IKoaError` for consumers who want the same typing. `NODE_ENV` is read on every error, not once at import. A thrown `null` or `undefined` still raises a `TypeError` here (the handler reads `.status` off it), unlike `createKoaErrorHandler`, which answers 500. Importing this subpath loads `graphql` (for the `GraphQLError` check); `@sentry/node` and `dotenv` are used only if installed, and `createKoaErrorHandler` needs none of them.

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

**Import:** `import { IKoaError } from '@axiumine/koa-utils/koa/IKoaError'`

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

**Notes:** Used as the internal type annotation inside `tdwKoaErrorHandler.mts` for the caught error; also published under `./koa/IKoaError` for consumers who want to type their own error-handling code against the same shape.

## `IKoaErrorHandlerOptions`

**Import:** `import { IKoaErrorHandlerOptions } from '@axiumine/koa-utils/koa/IKoaErrorHandlerOptions'`

**Signature:**
```ts
interface IKoaErrorHandlerOptions<TCtx extends IKoaErrorHandlerContext = IKoaErrorHandlerContext> {
	statusOf?: ((err: unknown, ctx: TCtx) => number) | undefined
	bodyOf?: ((err: unknown, ctx: TCtx) => unknown) | undefined
	report?: ((err: unknown, ctx: TCtx) => void) | undefined
	noBodyStatuses?: readonly number[] | undefined
}
```

The options object of `createKoaErrorHandler`. Each field accepts an explicit `undefined`, so `{ report: maybeReport }` type-checks under `exactOptionalPropertyTypes` without a conditional spread. `TCtx` is the context type your callbacks receive; pass Koa's `ParameterizedContext` or your own extension of `IKoaErrorHandlerContext`.

**Notes:** Purely structural, no runtime logic. Defaults and behaviour of each field are described under `createKoaErrorHandler`.

## `IKoaErrorHandlerContext`

**Import:** `import { IKoaErrorHandlerContext } from '@axiumine/koa-utils/koa/IKoaErrorHandlerContext'`

**Signature:**
```ts
interface IKoaErrorHandlerContext {
	status: number
	body: unknown
	app: { emit(event: string, err: unknown, ctx: unknown): unknown }
}
```

The part of a Koa context that `createKoaErrorHandler` reads and writes. Koa's `ParameterizedContext` and `IContextKoaErrorHandler` both satisfy it (`app.emit` uses method syntax, which TypeScript checks bivariantly, so a narrower `emit` signature still fits), which is why the factory needs no `koa` types.

**Notes:** Purely structural. Extend it to add your own fields (`interface IMyCtx extends IKoaErrorHandlerContext { requestId: string }`) and pass `IMyCtx` as `TCtx`.
