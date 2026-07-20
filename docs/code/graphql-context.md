# GraphQL — Context Types

This section documents the TypeScript shapes used to describe the Koa `ctx` object as it flows through the GraphQL-adjacent parts of this library — the login/logout/refresh mutations, the authenticated-resource middleware, and the Koa error handler. These are structural types (not classes or runtime values): they narrow the ambient Koa context down to exactly the fields each piece of code reads or writes (`state.user`, `cookies`, `request.header`, `app.emit`, `body`, `status`). `TCommonHeaders` is the shared header shape reused by three of the four exported context types; the others compose it with Node's `IncomingHttpHeaders` and library types such as `ICookies`.

## `TCommonHeaders`

**Import:** `import { TCommonHeaders } from '@axiumine/koa-utils/graphQL/schema/context/TCommonHeaders'`

**Signature:**
```ts
export type TCommonHeaders = {
	host?: string
	authorization?: string
	'user-agent'?: string
	'content-type'?: string
	'content-length'?: string
	'x-introspectioncode'?: string
	accept?: string
	origin?: string
	referer?: string
	cookie?: string
	connection?: string
	dnt?: string
	operation?: string
	// Add other common headers as needed
}
```

A plain map of the HTTP request headers this codebase actually cares about, keyed by lower-case header name (as Node normalizes them). It is intersected with `IncomingHttpHeaders` (from Node's `http` module) in every context type that includes `request.header`, so consumers get both the named, documented headers above and the full generic header index signature from Node.

**Notes:** `x-introspectioncode` is a custom header (not a standard HTTP header) — used somewhere in this codebase to gate GraphQL introspection. The type is intentionally open-ended ("Add other common headers as needed") — it is not an exhaustive header list, just the ones read by name elsewhere in the package.

## `IContextAuthenticatedResource`

**Import:** `import { IContextAuthenticatedResource } from '@axiumine/koa-utils/graphQL/schema/context/IContextAuthenticatedResource'`

**Signature:**
```ts
interface ISessionApi {
	id: Types.ObjectId
}

type IStateApi = {
	user: ISessionApi
}

export type IContextAuthenticatedResource = {
	state: IStateApi
	request: {
		header?: TCommonHeaders & IncomingHttpHeaders
	}
}
```

The context shape expected by resource APIs guarded by `authenticatedResourceHandler`. After that middleware runs, `ctx.state.user` is populated with just the authenticated user's Mongo `ObjectId` (`state.user.id`) — nothing else is carried at this layer, because a disabled/deleted user is already blocked at the resource-handler level before this shape is consumed, so callers don't need to re-check `disabled`/`deleted` flags here. `request.header` is optional and typed as the common-headers map merged with Node's full `IncomingHttpHeaders`.

**Notes:** The commented-out `disabled?` / `deleted?` fields on the internal `ISessionApi` interface are intentionally omitted from the public shape (see source comments) — resource-handler-level gating already accounts for the Redis quirk where these flags are the literal strings `'true'`/`'false'`, not booleans. `ISessionApi` and `IStateApi` are internal (not exported); only `IContextAuthenticatedResource` is part of the public API.

## `IContextLogin`

**Import:** `import { IContextLogin } from '@axiumine/koa-utils/graphQL/schema/context/IContextLogin'`

**Signature:**
```ts
export type IContextLogin = {
	cookies: ICookies
}
```

The minimal context shape needed by the `login*` family of mutations (`loginRememberme`, `login4Ever`, `loginAdmin`): access to `ctx.cookies` so the resolver can call `setLoginCookies` to set the signed `refresh_token` cookie after a successful login. It carries no `state` or `request.header` — login resolvers don't need pre-existing auth state, they create it.

**Notes:** `ICookies` (from `@lib/ICookies.mjs`, exported as `./lib/ICookies`) is the cookie-jar shape: `set(key: 'access_token' | 'refresh_token', value, options)` and `get(key)`, where `options` includes `httpOnly`, `sameSite`, `secure`, `path`, `expirationDate`, `maxAge`. Consistent with the project-wide convention, `secure` is set to `false` at the Koa/Nginx layer intentionally (TLS terminates at Nginx).

## `IContextLogout`

**Import:** `import { IContextLogout } from '@axiumine/koa-utils/graphQL/schema/context/IContextLogout'`

**Signature:**
```ts
interface ISessionApi {
	refreshToken: string // 90 days - cookie
	accessToken?: string // 90 min - headers
}

type IStateApi = {
	user: ISessionApi
}

export type IContextLogout = {
	state: IStateApi
	cookies: ICookies
	request: {
		header?: TCommonHeaders & IncomingHttpHeaders
	}
}
```

The context shape used by the `logout` mutation / `authenticatedLogoutHandler`. `state.user.refreshToken` is the 90-day refresh token (read from the signed cookie) and `state.user.accessToken` is the optional 90-minute access token (read from the `Authorization` header) — both are plain `string`s here (already resolved to their token values, not the raw cookie/header). `cookies` gives access to clear the `refresh_token` cookie on logout, and `request.header` exposes the common headers merged with Node's `IncomingHttpHeaders`.

**Notes:** The `90 days` / `90 min` inline comments document the token lifetimes enforced elsewhere in the package (refresh token TTL and access token TTL respectively) — see `tokens`/`tokenOptions` and the 30–90 min access-token jitter behavior, which this type does not itself implement but whose output it carries. `ISessionApi` and `IStateApi` here are internal, file-local re-declarations (not exported, and distinct from the same-named internal types in `IContextAuthenticatedResource.mts`).

## `IContextRefresh`

**Import:** `import { IContextRefresh } from '@axiumine/koa-utils/graphQL/schema/context/IContextRefresh'`

**Signature:**
```ts
interface ISessionAuthenticated {
	id: Types.ObjectId
	refreshToken: string
}

type IStateAuthenticated = {
	user: ISessionAuthenticated
}

export type IContextRefresh = {
	state: IStateAuthenticated
	cookies: ICookies
	request: {
		header?: TCommonHeaders & IncomingHttpHeaders
	}
}
```

The context shape used by the `refresh` mutation, following `authenticatedAuthorizationHandler`. `state.user.id` is the authenticated user's Mongo `ObjectId`, and `state.user.refreshToken` is the current refresh token value (already validated against Redis and Keygrip by the middleware) that the resolver uses to look up and then rotate/delete the session. `cookies` lets the resolver set the new rotated refresh-token cookie, and `request.header` exposes the merged common/Node headers.

**Notes:** Per the auth-flow convention documented for this codebase, `refresh` rotates both access and refresh tokens (new random 30–90 min access TTL, 90-day refresh TTL), deletes the old refresh Redis entry, and sets a new cookie — this type only describes the inbound `ctx` shape the resolver reads, not that rotation logic itself. The commented-out `disabled?`/`deleted?` fields on the internal `ISessionAuthenticated` interface are omitted for the same reason as in `IContextAuthenticatedResource` (already gated upstream; Redis stores these as the strings `'true'`/`'false'`).

## `IContextKoaErrorHandler`

**Import:** `import { IContextKoaErrorHandler } from '@axiumine/koa-utils/graphQL/schema/context/IContextKoaErrorHandler'`

**Signature:**
```ts
export interface IContextKoaErrorHandler {
	status: number
	body: {
		description?: string
		message: string
	}
	app: {
		emit(event: string, err: IKoaError, ctx: IContextKoaErrorHandler): void
	}
}
```

The context shape consumed by `tdwKoaErrorHandler` (exported separately as `./koa/tdwKoaErrorHandler`). `status` is the HTTP status code being written to the response; `body` is the JSON error payload the handler sets, with a required `message` and an optional `description`; `app.emit` mirrors Koa's `Application#emit`, used by the handler to forward the error as an `'error'` event (e.g. for Sentry/logging integrations) with the typed `IKoaError` payload and the context itself.

**Notes:** Published under `./graphQL/schema/context/IContextKoaErrorHandler`, so consumers can import this type directly when typing their own error-handling middleware. Per the project-wide convention, `tdwKoaErrorHandler` skips writing a body for statuses `[100, 101, 102, 204, 205, 304]`, so `ctx.body` on this type should not be assumed populated for those statuses. `IKoaError` (from `src/koa/IKoaError.mts`) is also published, under `./koa/IKoaError`.
