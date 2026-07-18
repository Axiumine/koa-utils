# GraphQL — Errors & Status

Every GraphQL error in this codebase is raised through a small hierarchy: `throwGraphQLError` is the single primitive that constructs and throws a `GraphQLError` carrying an HTTP-style status code, a title, and a description in `extensions`; every other `throwXxxError` helper wraps it with a fixed (or defaulted) status/title/description for one specific situation, so resolver code never has to remember raw status numbers or spell out `extensions.http.status` by hand. `status.mts` is a separate, unrelated set of short string constants used as `status` field values in GraphQL response payloads (e.g. `RetStatusType`), not as HTTP status codes. Resolvers should always throw via one of the `throwXxxError` helpers (never a raw `GraphQLError`) and let `customFormatErrorFn` / `tdwKoaErrorHandler` turn the thrown error into the HTTP response.

## Quick reference — throw helpers by HTTP status

| HTTP Status | Helper(s) | Title | Use when |
|---|---|---|---|
| 204 No Content | `throwAlreadyDone` | `''` (empty) | The requested action was already completed; 204 forbids a body so title/description are empty. |
| 400 Bad Request | `throwErrorWrongUserInput` | `Bad Request` | Caller-supplied input fails validation. |
| 401 Unauthorized | `throwUnauthorizedError` | `Unauthorized` | Generic "you are not authorized to do this" case. |
| 402 Payment Required | `throwPaymentRequiredError` | `Payment Required` | Feature is gated behind a subscription/paid plan. |
| 403 Forbidden | `throwForbiddenError` | `Forbidden` | Caller is authenticated but not allowed to access the resource. |
| 404 Not Found | `throwNotFoundError` | `Oops` (`ERR_OOPS`) | Resource/route lookup failed. |
| 405 Method Not Allowed | `throwMethodNotAllowedError` | `Oops` (`ERR_OOPS`) | Endpoint hit with a method it doesn't support (misconfiguration). |
| 406 Not Acceptable | `throwNotAcceptableError` | `Oops` (`ERR_OOPS`) | Requested representation cannot be produced (misconfiguration). |
| 409 Conflict | `throwAlreadyTakenError`, `throwConflictError` | `Conflict` | Action already performed / resource already taken (e.g. duplicate email already verified). `throwConflictError` is a thin alias that forwards to `throwAlreadyTakenError`. |
| 410 Gone | `throwGoneError` | `Oops` (`ERR_OOPS`) | Resource permanently gone (misconfiguration by default). |
| 412 Precondition Failed | `throwPreconditionFailedNoAuthCookie`, `throwPreconditionFailedNoAuthHeader` | `Precondition Failed` | A required auth cookie / auth header is missing from the request entirely. |
| 415 Unsupported Media Type | `throwUnsupportedMediaTypeError` | `Unsupported Media Type` | Request body's media type isn't supported. |
| 422 Unprocessable Content | `throwUnprocessableContentError` | `Unprocessable Content` | Request is well-formed but semantically un-actionable. |
| 429 Too Many Requests | `throwTooManyRequestsError` | `Too Many Requests` | Rate limit exceeded. |
| 498 Invalid Token (non-standard) | `throwAccessTokenExpiredOrDeleted`, `throwRefreshTokenExpiredOrDeleted` | `Invalid Token` | The presented access/refresh token is expired, or was deleted server-side (e.g. an admin revoked it). |
| 499 Token Required (non-standard) | `throwAccessTokenRequired`, `throwMissingMalformedInvalidToken`, `throwRefreshTokenRequired`, `throwRefreshTokenSignatureRequired` | `Token Required` | A token (or its signature) is missing, malformed, or wasn't supplied at all. |
| 500 Internal Server Error | `throwInternalError` | `Internal Server Error` | Unexpected server-side failure; caller-visible text is intentionally generic. |
| 501 Not Implemented | `throwNotImplementedError` | `Oops` (`ERR_OOPS`) | Code path that is not yet implemented (misconfiguration/placeholder). |

`ERR_OOPS` (`'Oops'`) and `ERR_MISCONFIGURED` (`'We have misconfigured some services. Our technicians are already fixing the problem. Please try again later.'`) come from the internal `src/private/graphQL/Consts.mts` module and are shared as the default title/description across the "this shouldn't normally happen" family (404/405/406/410/501).

## `throwGraphQLError`

**Import:** `import { throwGraphQLError } from '@axiumine/koa-utils/graphQL/throw/throwGraphQLError'`

**Signature:**
```ts
export const throwGraphQLError = (status: number, title: string, description: string = '') => {
	throw new GraphQLError(title, { extensions: { http: { status }, description } })
}
```

The base primitive all other `throwXxxError` helpers wrap. Constructs a `graphql` `GraphQLError` whose `message` is `title` and whose `extensions` carry `{ http: { status }, description }`. Downstream code (e.g. `customFormatErrorFn`, `tdwKoaErrorHandler`) reads `extensions.http.status` to set the actual HTTP response status and reads `description` for the response body. Use this directly only when none of the specific `throwXxxError` helpers fit; otherwise prefer the specific helper so status/title/description stay consistent across the codebase.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| status | number | HTTP-style status code placed at `extensions.http.status`. |
| title | string | Becomes the `GraphQLError` message (its "title"). |
| description | string | Optional; defaults to `''`. Extra detail placed at `extensions.description`. |

**Returns:** `never` (always throws) — declared as `void`-returning but the function body unconditionally throws.

**Throws:** `GraphQLError` — always, with the given `status`/`title`/`description`.

**Notes:** `customFormatErrorFn` re-throws `GraphQLError`s (it does not return them) so Koa's error middleware catches them; `tdwKoaErrorHandler` skips sending a body for statuses `[100,101,102,204,205,304]`.

## `throwAlreadyDone`

**Import:** `import { throwAlreadyDone } from '@axiumine/koa-utils/graphQL/throw/throwAlreadyDone'`

**Signature:**
```ts
export const throwAlreadyDone = () => {
	throw throwGraphQLError(204, '', '')
}
```

Signals that the requested action was already completed and there is nothing further to do. Uses HTTP 204 (No Content), so both title and description are intentionally empty strings — per the codebase's own convention (see `src/graphQL/throw/readme.txt`), status codes `100, 101, 102, 204, 205, 304` do not allow response body content, and `tdwKoaErrorHandler` skips the body for exactly this list.

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 204`, empty title/description.

**Notes:** Because 204 forbids a body, do not add a non-empty description here — any consumer expecting a body-less 204 response would break.

## `throwErrorWrongUserInput`

**Import:** `import { throwErrorWrongUserInput } from '@axiumine/koa-utils/graphQL/throw/throwErrorWrongUserInput'`

**Signature:**
```ts
export const throwErrorWrongUserInput = (message: string) => {
	throw throwGraphQLError(400, 'Bad Request', message)
}
```

Throws a 400 Bad Request for caller-supplied input that fails validation (e.g. malformed field, invalid enum value). The caller must supply the specific validation message.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| message | string | Description of what was wrong with the input; becomes `extensions.description`. |

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 400`, title `'Bad Request'`.

## `throwUnauthorizedError`

**Import:** `import { throwUnauthorizedError } from '@axiumine/koa-utils/graphQL/throw/throwUnauthorizedError'`

**Signature:**
```ts
export const throwUnauthorizedError = (text: string = 'You are unauthorized.') => {
	throw throwGraphQLError(401, 'Unauthorized', text)
}
```

Generic 401 for "you are not authorized to perform this action" (e.g. failed login credential check). `text` defaults to a generic message but can be overridden with more specific context.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| text | string | Optional; defaults to `'You are unauthorized.'`. Becomes `extensions.description`. |

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 401`, title `'Unauthorized'`.

## `throwPaymentRequiredError`

**Import:** `import { throwPaymentRequiredError } from '@axiumine/koa-utils/graphQL/throw/throwPaymentRequiredError'`

**Signature:**
```ts
export const throwPaymentRequiredError = () => {
	throw throwGraphQLError(402, 'Payment Required', 'You must have a subscription to use this feature.')
}
```

Throws a fixed 402 for gating a feature behind a paid subscription. No parameters — title and description are both fixed.

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 402`, title `'Payment Required'`.

## `throwForbiddenError`

**Import:** `import { throwForbiddenError } from '@axiumine/koa-utils/graphQL/throw/throwForbiddenError'`

**Signature:**
```ts
export const throwForbiddenError = () => {
	throw throwGraphQLError(403, 'Forbidden', 'Forbidden.')
}
```

Throws a fixed 403 for an authenticated caller who lacks permission for the requested resource/action. No parameters.

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 403`, title `'Forbidden'`.

## `throwNotFoundError`

**Import:** `import { throwNotFoundError } from '@axiumine/koa-utils/graphQL/throw/throwNotFoundError'`

**Signature:**
```ts
export const throwNotFoundError = (desc: string = ERR_MISCONFIGURED) => {
	throw throwGraphQLError(404, ERR_OOPS, desc)
}
```

Throws a 404 for a resource/route lookup that failed. Title is always the shared `ERR_OOPS` (`'Oops'`) constant; description defaults to the shared `ERR_MISCONFIGURED` copy but can be overridden with a more specific message.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| desc | string | Optional; defaults to `ERR_MISCONFIGURED`. Becomes `extensions.description`. |

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 404`, title `'Oops'`.

**Notes:** `ERR_OOPS` / `ERR_MISCONFIGURED` come from the internal `src/private/graphQL/Consts.mts` module (not part of the package's public `exports`).

## `throwMethodNotAllowedError`

**Import:** `import { throwMethodNotAllowedError } from '@axiumine/koa-utils/graphQL/throw/throwMethodNotAllowedError'`

**Signature:**
```ts
export const throwMethodNotAllowedError = () => {
	throw throwGraphQLError(405, ERR_OOPS, ERR_MISCONFIGURED)
}
```

Throws a fixed 405 (title `ERR_OOPS`, description `ERR_MISCONFIGURED`) — intended for a request hitting an endpoint/method combination that shouldn't be reachable given a correct configuration. No parameters.

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 405`, title `'Oops'`.

## `throwNotAcceptableError`

**Import:** `import { throwNotAcceptableError } from '@axiumine/koa-utils/graphQL/throw/throwNotAcceptableError'`

**Signature:**
```ts
export const throwNotAcceptableError = () => {
	throw throwGraphQLError(406, ERR_OOPS, ERR_MISCONFIGURED)
}
```

Throws a fixed 406 (title `ERR_OOPS`, description `ERR_MISCONFIGURED`) for a request whose acceptable representation cannot be produced — treated as a misconfiguration case rather than user error. No parameters.

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 406`, title `'Oops'`.

## `throwAlreadyTakenError`

**Import:** `import { throwAlreadyTakenError } from '@axiumine/koa-utils/graphQL/throw/throwAlreadyTakenError'`

**Signature:**
```ts
export const throwAlreadyTakenError = (desc: string = 'You have already done this.') => {
	// es. invio email a chi l'ha già ricevuta
	throw throwGraphQLError(409, 'Conflict', desc)
}
```

Throws a 409 Conflict for "you already did this" situations — the Italian inline comment gives the canonical example: sending a verification/notification email to someone who already received it. Description defaults to a generic message but should usually be overridden with the specific situation.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| desc | string | Optional; defaults to `'You have already done this.'`. Becomes `extensions.description`. |

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 409`, title `'Conflict'`.

## `throwConflictError`

**Import:** `import { throwConflictError } from '@axiumine/koa-utils/graphQL/throw/throwConflictError'`

**Signature:**
```ts
export const throwConflictError = (desc: string = 'You have already done this.') => {
	// es. invio email a chi l'ha già ricevuta
	throw throwAlreadyTakenError(desc)
}
```

A pure alias for `throwAlreadyTakenError` — same 409 status, same default description, same wording of the intended use case. Kept as a separate export for call-site readability (`throwConflictError` reads better in some resolvers than `throwAlreadyTakenError`); behaviorally identical.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| desc | string | Optional; defaults to `'You have already done this.'`. Forwarded to `throwAlreadyTakenError`. |

**Returns:** `never` — always throws (via `throwAlreadyTakenError`).

**Throws:** `GraphQLError` with `extensions.http.status = 409`, title `'Conflict'`.

## `throwGoneError`

**Import:** `import { throwGoneError } from '@axiumine/koa-utils/graphQL/throw/throwGoneError'`

**Signature:**
```ts
export const throwGoneError = (desc: string = ERR_MISCONFIGURED) => {
	throw throwGraphQLError(410, ERR_OOPS, desc)
}
```

Throws a 410 Gone for a resource that used to exist but is permanently unavailable. Title is fixed to `ERR_OOPS`; description defaults to `ERR_MISCONFIGURED` but can be overridden.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| desc | string | Optional; defaults to `ERR_MISCONFIGURED`. Becomes `extensions.description`. |

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 410`, title `'Oops'`.

## `throwPreconditionFailedNoAuthCookie`

**Import:** `import { throwPreconditionFailedNoAuthCookie } from '@axiumine/koa-utils/graphQL/throw/throwPreconditionFailedNoAuthCookie'`

**Signature:**
```ts
export const throwPreconditionFailedNoAuthCookie = () => {
	throw throwGraphQLError(412, 'Precondition Failed', 'No authorization cookie.')
}
```

Throws a fixed 412 specifically when a required authorization cookie is entirely missing from the request (e.g. the refresh-token flow, which authenticates via a signed cookie rather than a header). No parameters.

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 412`, title `'Precondition Failed'`.

## `throwPreconditionFailedNoAuthHeader`

**Import:** `import { throwPreconditionFailedNoAuthHeader } from '@axiumine/koa-utils/graphQL/throw/throwPreconditionFailedNoAuthHeader'`

**Signature:**
```ts
export const throwPreconditionFailedNoAuthHeader = () => {
	throw throwGraphQLError(412, 'Precondition Failed', 'No authorization header.')
}
```

Throws a fixed 412 specifically when a required `Authorization` header is entirely missing from the request (e.g. `authenticatedResourceHandler` expecting `Authorization: Bearer access:<uuid>`). No parameters.

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 412`, title `'Precondition Failed'`.

## `throwUnsupportedMediaTypeError`

**Import:** `import { throwUnsupportedMediaTypeError } from '@axiumine/koa-utils/graphQL/throw/throwUnsupportedMediaTypeError'`

**Signature:**
```ts
export const throwUnsupportedMediaTypeError = () => {
	throw throwGraphQLError(415, 'Unsupported Media Type', 'The chosen media type is not supported. Please change the media type.')
}
```

Throws a fixed 415 for a request whose body media type (e.g. an unsupported upload MIME type) is not supported. No parameters.

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 415`, title `'Unsupported Media Type'`.

## `throwUnprocessableContentError`

**Import:** `import { throwUnprocessableContentError } from '@axiumine/koa-utils/graphQL/throw/throwUnprocessableContentError'`

**Signature:**
```ts
export const throwUnprocessableContentError = (
	txt: string = 'We are unable to process the instructions contained in the request.'
) => {
	throw throwGraphQLError(422, 'Unprocessable Content', txt)
}
```

Throws a 422 for a request that is well-formed but semantically cannot be acted on. Distinct from `throwErrorWrongUserInput` (400), which is for malformed/invalid input rather than valid-but-unactionable input.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| txt | string | Optional; defaults to `'We are unable to process the instructions contained in the request.'`. Becomes `extensions.description`. |

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 422`, title `'Unprocessable Content'`.

## `throwTooManyRequestsError`

**Import:** `import { throwTooManyRequestsError } from '@axiumine/koa-utils/graphQL/throw/throwTooManyRequestsError'`

**Signature:**
```ts
export const throwTooManyRequestsError = (desc: string = '') => {
	throw throwGraphQLError(429, 'Too Many Requests', desc)
}
```

Throws a 429 when a caller has exceeded a rate limit. Description defaults to an empty string; pass specifics (e.g. retry-after guidance) when known.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| desc | string | Optional; defaults to `''`. Becomes `extensions.description`. |

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 429`, title `'Too Many Requests'`.

## `throwAccessTokenExpiredOrDeleted`

**Import:** `import { throwAccessTokenExpiredOrDeleted } from '@axiumine/koa-utils/graphQL/throw/throwAccessTokenExpiredOrDeleted'`

**Signature:**
```ts
export const throwAccessTokenExpiredOrDeleted = () => {
	throw throwGraphQLError(498, 'Invalid Token', 'Access Token is expired or deleted by Admin.')
}
```

Throws a fixed, non-standard 498 ("Invalid Token", a de-facto convention borrowed from ESRI) when a presented access token's Redis entry (`${REDIS_KEY}access:<uuid>`) has expired or was explicitly removed (e.g. an admin revoked it). Used by `authenticatedResourceHandler`-style middleware. No parameters.

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 498`, title `'Invalid Token'`.

## `throwAccessTokenRequired`

**Import:** `import { throwAccessTokenRequired } from '@axiumine/koa-utils/graphQL/throw/throwAccessTokenRequired'`

**Signature:**
```ts
export const throwAccessTokenRequired = () => {
	throw throwGraphQLError(499, 'Token Required', 'Access Token Required.')
}
```

Throws a fixed, non-standard 499 when no access token at all was supplied on the request (distinct from `throwAccessTokenExpiredOrDeleted`, which is for a token that was supplied but is no longer valid). No parameters.

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 499`, title `'Token Required'`.

## `throwMissingMalformedInvalidToken`

**Import:** `import { throwMissingMalformedInvalidToken } from '@axiumine/koa-utils/graphQL/throw/throwMissingMalformedInvalidToken'`

**Signature:**
```ts
export const throwMissingMalformedInvalidToken = () => {
	throw throwGraphQLError(499, 'Token Required', 'Missing/malformed/invalid token.')
}
```

Throws the same 499 "Token Required" status as `throwAccessTokenRequired`/`throwRefreshTokenRequired`, but with a generic description covering the case where a token is missing, malformed, or fails basic validation without more specific classification available. No parameters.

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 499`, title `'Token Required'`.

## `throwRefreshTokenExpiredOrDeleted`

**Import:** `import { throwRefreshTokenExpiredOrDeleted } from '@axiumine/koa-utils/graphQL/throw/throwRefreshTokenExpiredOrDeleted'`

**Signature:**
```ts
export const throwRefreshTokenExpiredOrDeleted = () => {
	throw throwGraphQLError(498, 'Invalid Token', 'Refresh Token is expired or deleted by Admin.')
}
```

Refresh-token counterpart to `throwAccessTokenExpiredOrDeleted`: thrown when the refresh token's Redis entry (`${REDIS_KEY}refresh:<uuid>`) has expired or was deleted server-side. Used along the `refresh` mutation / `authenticatedAuthorizationHandler` path. No parameters.

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 498`, title `'Invalid Token'`.

## `throwRefreshTokenRequired`

**Import:** `import { throwRefreshTokenRequired } from '@axiumine/koa-utils/graphQL/throw/throwRefreshTokenRequired'`

**Signature:**
```ts
export const throwRefreshTokenRequired = () => {
	throw throwGraphQLError(499, 'Token Required', 'Refresh Token Required.')
}
```

Refresh-token counterpart to `throwAccessTokenRequired`: thrown when no refresh token was supplied at all (e.g. the signed refresh cookie is absent, distinct from `throwPreconditionFailedNoAuthCookie` which covers the cookie header being missing outright). No parameters.

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 499`, title `'Token Required'`.

## `throwRefreshTokenSignatureRequired`

**Import:** `import { throwRefreshTokenSignatureRequired } from '@axiumine/koa-utils/graphQL/throw/throwRefreshTokenSignatureRequired'`

**Signature:**
```ts
export const throwRefreshTokenSignatureRequired = () => {
	throw throwGraphQLError(499, 'Token Required', 'Refresh Token Signature Required.')
}
```

Thrown when the refresh cookie's Keygrip signature (verified via `verifySignedRefreshToken`) is missing/invalid — distinct from `throwRefreshTokenRequired`, which is for the token value itself being absent. No parameters.

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 499`, title `'Token Required'`.

## `throwInternalError`

**Import:** `import { throwInternalError } from '@axiumine/koa-utils/graphQL/throw/throwInternalError'`

**Signature:**
```ts
export const throwInternalError = (desc: string = '') => {
	throw throwGraphQLError(500, 'Internal Server Error', `Error reported to Dev Team.${desc}`)
}
```

Throws a 500 for unexpected server-side failures. The description is always prefixed with `'Error reported to Dev Team.'` — the caller-supplied `desc` is appended (not replacing) that fixed prefix, so the caller-visible text stays generic even when `desc` is provided.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| desc | string | Optional; defaults to `''`. Appended directly (no separator) after the fixed `'Error reported to Dev Team.'` prefix. |

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 500`, title `'Internal Server Error'`.

## `throwNotImplementedError`

**Import:** `import { throwNotImplementedError } from '@axiumine/koa-utils/graphQL/throw/throwNotImplementedError'`

**Signature:**
```ts
export const throwNotImplementedError = () => {
	throw throwGraphQLError(501, ERR_OOPS, ERR_MISCONFIGURED)
}
```

Throws a fixed 501 (title `ERR_OOPS`, description `ERR_MISCONFIGURED`) for a code path that is not yet implemented. No parameters.

**Returns:** `never` — always throws.

**Throws:** `GraphQLError` with `extensions.http.status = 501`, title `'Oops'`.

## Status string constants (`status.mts`)

These are unrelated to the HTTP-status `throwXxxError` family above: they are plain string literals meant to populate the `status` field of GraphQL response payload types (e.g. alongside `RetStatusType` / `RetStatusMexType`), not `extensions.http.status` values. All seven are declared in the same file, `src/graphQL/status.mts`.

> **Discrepancy found:** `package.json`'s `exports` map only publishes this file under the key `"./graphQL/schema/status"`, pointing at `./dist/graphQL/schema/status.mjs` — but the source lives at `src/graphQL/status.mts` and builds to `dist/graphQL/status.mjs` (no `schema` segment). The exports entry does not match where the built file actually is, so `import ... from '@axiumine/koa-utils/graphQL/schema/status'` will 404 against a real install. Flagging for the maintainer to fix (either move the source under `schema/`, add a second correct exports entry, or correct the existing path).

### `stOk`

**Import:** `import { stOk } from '@axiumine/koa-utils/graphQL/schema/status'` _(see discrepancy note above — this exports path does not currently resolve to a built file)_

**Signature:**
```ts
export const stOk = 'ok'
```

Generic "operation succeeded" status value.

### `stExist`

**Import:** `import { stExist } from '@axiumine/koa-utils/graphQL/schema/status'` _(see discrepancy note above)_

**Signature:**
```ts
export const stExist = 'exist'
```

Indicates the target resource/record already exists (e.g. a duplicate signup or a value already taken).

### `stFailToSendEmail`

**Import:** `import { stFailToSendEmail } from '@axiumine/koa-utils/graphQL/schema/status'` _(see discrepancy note above)_

**Signature:**
```ts
export const stFailToSendEmail = 'failToSendEmail'
```

Indicates the underlying operation succeeded but the follow-up transactional email failed to send.

### `stNotFoundNotMatch`

**Import:** `import { stNotFoundNotMatch } from '@axiumine/koa-utils/graphQL/schema/status'` _(see discrepancy note above)_

**Signature:**
```ts
export const stNotFoundNotMatch = 'notFoundNotMatch'
```

Indicates a lookup found no matching record, or a record was found but a secondary check (e.g. a hash/token comparison) did not match.

### `stErrBackend`

**Import:** `import { stErrBackend } from '@axiumine/koa-utils/graphQL/schema/status'` _(see discrepancy note above)_

**Signature:**
```ts
export const stErrBackend = 'errBackend'
```

Indicates a generic backend-side error occurred while processing the request.

### `stWait`

**Import:** `import { stWait } from '@axiumine/koa-utils/graphQL/schema/status'` _(see discrepancy note above)_

**Signature:**
```ts
export const stWait = 'wait'
```

Indicates the caller should wait before retrying (e.g. a cooldown/rate-limit style status distinct from throwing `throwTooManyRequestsError`).

### `stExpired`

**Import:** `import { stExpired } from '@axiumine/koa-utils/graphQL/schema/status'` _(see discrepancy note above)_

**Signature:**
```ts
export const stExpired = 'expired'
```

Indicates the referenced resource (e.g. a token, hash, or time-limited link) has expired.
