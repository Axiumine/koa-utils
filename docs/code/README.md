# @axiumine/koa-utils — Code Reference

`@axiumine/koa-utils` is a TypeScript utility library for Koa + GraphQL backends: auth (signup/login/refresh/logout) mutations and middleware, Mongoose models, GraphQL error helpers, file-upload pipeline, transactional email, and low-level DB/Redis helpers. It ships ESM-only (`.mjs` / `.d.mts`) and targets Node `^24.14.0`. Current version: **5.1.1**.

## Install

```
npm i @axiumine/koa-utils
```

All dependencies are declared as `peerDependencies` — the library itself ships zero runtime `dependencies`, so the consuming project controls the installed versions of Koa, Mongoose, GraphQL, Redis, etc.

## Importing

There is no barrel/index export. Every symbol is imported from its own subpath, matching the `exports` map in `package.json`:

```ts
import { signUp } from '@axiumine/koa-utils/graphQL/schema/mutations/signUp'
import { authenticatedResourceHandler } from '@axiumine/koa-utils/koa/middleware/authenticatedResourceHandler'
```

## Sections

| Section | Contents |
|---|---|
| [Data Sources](./data-sources.md) | Connect/disconnect helpers for MariaDB, MongoDB, PostgreSQL and Redis. |
| [Email (SocketLabs)](./email.md) | `SocketLabsLib` — transactional email (signup, reset, OTP, moderation) via SocketLabs. |
| [File Upload Pipeline](./files.md) | Temp storage, MIME/virus validation, image re-encode, and the `uploadTemp`/`uploadTempPdf` orchestrators. |
| [GraphQL — Mongoose Models](./graphql-models.md) | `UserBase` and the `log/*` collections (stats, errors, throws). |
| [GraphQL — Context Types](./graphql-context.md) | TypeScript shapes narrowing Koa's `ctx` for auth mutations and middleware. |
| [GraphQL — Object & Input Types](./graphql-types.md) | Reusable `GraphQLObjectType`/`GraphQLInputObjectType` building blocks and `IFindAndUpdate<T>`. |
| [GraphQL — Mutations](./graphql-mutations.md) | Sign-up, login variants, logout, refresh, password reset/change, email-change verify. |
| [GraphQL — Errors & Status](./graphql-errors.md) | `throwGraphQLError` and the `throwXxxError` helper hierarchy mapping to HTTP status codes. |
| [Koa — Core Helpers](./koa-core.md) | `customFormatErrorFn`, `logRequestToDb`, `tdwKoaErrorHandler`, and related interfaces. |
| [Koa — Auth Middleware & Router](./koa-middleware.md) | Redis-backed session guards, logout handler, and the email-verification router. |
| [Lib — Auth, Tokens, Crypto, Validation](./lib-core.md) | Token generation, cookie options, bcrypt helpers, validators, `tryCatchRethrow`. |
| [Lib — Utility Classes](./lib-utilities.md) | `ArrayLib`, `DateLib`, `NumLib`, `StringLib`. |
| [Lib — DB Error Mapping & Redis Booleans](./lib-datasource-errors.md) | Per-engine error shapes/mappers for MariaDB, MongoDB, PostgreSQL, plus the Redis boolean codec. |
| [Lib — DB Operations & Logging](./lib-db.md) | Direct MongoDB write helpers: hit-stat/error/call logging, sign-up's `registerNewUser`/`userExist`. |
| [Internal Helpers (private/)](./internal.md) | Non-exported `src/private/**` internals — documented for maintainers only. |

## Auth flow

Sign-up, login, refresh and logout are implemented across three sections: [GraphQL — Mutations](./graphql-mutations.md) defines the resolvers, [Koa — Auth Middleware & Router](./koa-middleware.md) guards requests and the refresh endpoint, and [Lib — Auth, Tokens, Crypto, Validation](./lib-core.md) supplies the token/cookie/bcrypt primitives they share. Read those three together to follow a session end-to-end.

## Internal helpers

[Internal Helpers (private/)](./internal.md) documents code under `src/private/**` that backs the public surface but is never itself exported — it exists for maintainers debugging or extending the library, not for consumers to import.
