# Lib — DB Operations & Logging

This section covers the package's direct MongoDB write helpers: fire-and-forget usage/error logging (`hitStat`, `logGlobalError`, `logGraphql`, `logThrow`), the typed shapes used when building `$set` / `$unset` updates against a user's `login` sub-document (`ILoginSet`, `ILoginUnset`), and the two building blocks of the sign-up flow (`registerNewUser`, `userExist`). All of these sit directly on Mongoose models from `@models/MongoDB/**` and are the lowest-level DB layer consumed by GraphQL mutations and Koa middleware higher up the stack.

## `hitStat`

**Import:** `import { hitStat } from '@axiumine/koa-utils/lib/db/log/hitStat'`

**Signature:**
```ts
const hitStat = async function (call: string)
```

Marks a named GraphQL call as "hit" on the most recent developer-stats document. It first fetches the single most recent `DevStatsGraphQLCalls` document (sorted by `dataora` descending, `limit(1)`), then runs `updateOne` matching that document's `_id` together with `'list.name': call`, setting `'list.$.hit': true` on the matched array element (positional operator), with `runValidators: true`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| call | string | The GraphQL operation/call name to flag as hit inside the `list` array of the latest stats document |

**Returns:** `Promise` resolving to the Mongoose `updateOne` result (`UpdateWriteOpResult`-like object) for the `DevStatsGraphQLCalls` collection (Mongo collection name `devStatsGraphQLCalls`).

**Notes:** Assumes at least one `DevStatsGraphQLCalls` document already exists — `ret[0]` is accessed without a null-check, so calling this against an empty collection throws a `TypeError` (`doc` is `undefined`). The matched array element requires a pre-existing entry with `name === call` inside `list`; if none matches, `updateOne` is a no-op (matches zero documents).

## `logGlobalError`

**Import:** `import { logGlobalError } from '@axiumine/koa-utils/lib/db/log/logGlobalError'`

**Signature:**
```ts
interface IGlobalError {
	message: string
	stackArr: Array<string>
}

const logGlobalError = function (log: IGlobalError)
```

Builds (but does **not** persist) a `LogGlobalError` document from a message/stack pair. If both `log.message === ''` and `log.stackArr.length === 0`, it returns immediately without constructing anything. Otherwise it instantiates `new LogGlobalError({})` and conditionally assigns `newGlobalError.m = log.message` (only if non-empty) and `newGlobalError.s = log.stackArr` (only if non-empty).

**Parameters:**

| Name | Type | Description |
|---|---|---|
| log | IGlobalError | `{ message: string, stackArr: Array<string> }` — the error message and its stack frames |

**Returns:** `void` — the function body has no `return` statement (the `newGlobalError.save()` call is commented out), so the constructed document is **never written to MongoDB**. Collection touched (when eventually enabled): `logGlobalError` (fields `m` = message, `s` = stack array, `i` = inserted date, backing model `LogGlobalError`).

**Notes:** This is currently a no-op with respect to persistence — treat it as a stub. `IGlobalError` is a local (non-exported) interface, not part of the public API.

## `logGraphql`

**Import:** `import { logGraphql } from '@axiumine/koa-utils/lib/db/log/logGraphql'`

**Signature:**
```ts
const logGraphql = function (owner: Types.ObjectId, nome: string, status: number, msTot: number)
```

Logga operazioni fatte da utenti (logs operations performed by users). Constructs a `new LogStatsGraphql({ owner, nome, status, msTot })` document but never calls `.save()` (the save/Promise logic is commented out below it).

**Parameters:**

| Name | Type | Description |
|---|---|---|
| owner | Types.ObjectId | The user/owner performing the call |
| nome | string | Name of the GraphQL operation |
| status | number | HTTP/GraphQL status code of the call |
| msTot | number | Total duration of the call, in milliseconds |

**Returns:** `void` — no document is persisted; the constructed instance is discarded. Collection touched (when eventually enabled): `logStatsGraphql` (fields `u` = user, `n` = query name, `s` = status, `m` = msTot, `i` = inserted date, backing model `LogStatsGraphql`).

**Notes:** Currently a stub, same as `logGlobalError` — constructing the model does not write to MongoDB. Referenced (commented out) from `src/koa/logRequestToDb.mts` as the intended call site for per-request GraphQL logging.

## `logThrow`

**Import:** `import { logThrow } from '@axiumine/koa-utils/lib/db/log/logThrow'`

**Signature:**
```ts
const logThrow = function (log: string, errLevel: number)
```

Constructs a `new LogThrow({ _id: new Types.ObjectId(), message: log, errLevel, inserted: new Date() })` document. As with the other two logging helpers, the `.save()` call is commented out, so nothing is persisted.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| log | string | The error/throw message to record |
| errLevel | number | Numeric severity/level of the error |

**Returns:** `void` — no document is persisted. Collection touched (when eventually enabled): `logThrow` (fields `u` = user, `m` = message, `el` = error level, `i` = inserted date, backing model `LogThrow`).

**Notes:** Source comments indicate the intended future behavior: send an email on log, with a flood-guard against the last sent email (possibly via a TTL-indexed collection or an admin-configurable kill switch) — none of that is implemented yet. Treat as a stub, not yet wired to persistence or email.

## `ILoginSet`

**Import:** `import { ILoginSet } from '@axiumine/koa-utils/lib/db/login/ILoginSet'`

**Signature:**
```ts
export interface ILoginSet {
	login?: {
		firstLogin?: Date
		lastLogin?: Date
		rememberMe?: boolean
	}
}
```

A type-only shape for the `$set` half of a Mongo update against the `user` collection's `login` sub-document (see `UserBase` schema in `@models/MongoDB/UserBase.mjs`, whose `login` fields include `email`, `password`, `firstLogin`, `lastLogin`). Use it to type the object passed as the `$set` payload of `updateOne`/`findOneAndUpdate` calls that touch first/last login timestamps or the remember-me flag, e.g. `{ $set: <ILoginSet> }`.

**Notes:** Pure compile-time type — no runtime code. Pairs with `ILoginUnset` for update calls that need to both set and unset fields on `login` in the same operation (e.g. setting `lastLogin`/`rememberMe` while unsetting a stale `rememberMe` counter).

## `ILoginUnset`

**Import:** `import { ILoginUnset } from '@axiumine/koa-utils/lib/db/login/ILoginUnset'`

**Signature:**
```ts
export interface ILoginUnset {
	login?: {
		rememberMe: number
	}
}
```

A type-only shape for the `$unset` half of a Mongo update against the `user` collection's `login` sub-document. Note the `rememberMe` field here is typed `number`, not `boolean` as in `ILoginSet` / the `UserBase` schema's `account.rememberMe` — for `$unset` operators the value conventionally carries no semantic meaning (Mongo ignores it, `1`/`""` are common conventions), so this is a shape mismatch with `ILoginSet` rather than a duplicate of the same field.

**Notes:** Pure compile-time type — no runtime code. Use as `{ $unset: <ILoginUnset> }` alongside `ILoginSet`'s `{ $set: ... }` in the same update document.

## `registerNewUser`

**Import:** `import { registerNewUser } from '@axiumine/koa-utils/lib/db/registerNewUser'`

**Signature:**
```ts
async function registerNewUser(uEmail: string, password: string, session: ClientSession)
```

Creates a brand-new `UserBase` document (collection `user`) inside the given Mongo session/transaction. Generates a fresh `_id` (`new Types.ObjectId()`), captures `nowDt = new Date()`, generates an email-verification hash via `emailHash()`, and hashes the plaintext `password` via `encryptPassword` (bcrypt, `SALT_ROUNDS = 14`). It then builds the new user document with:
- `login.email = uEmail`, `login.password = <bcrypt hash>`
- `account.email.valid = false`, `account.email.dateLastReq = nowDt`, `account.email.requestTimes = 1`, `account.email.hash = hashConfirmEmail`
- `account.registrationDate = nowDt`

and inserts it via `UserBase.create(newUsers, { session })`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| uEmail | string | The (already lower-cased/trimmed, length-checked) user email to register |
| password | string | The plaintext password to hash and store |
| session | ClientSession | An active Mongoose `ClientSession`, expected to be inside a `withTransaction` block |

**Returns:** `Promise<string>` — the generated `hashConfirmEmail` (from `emailHash()`), used by the caller to build the "verify your email" link/email.

**Notes:** Logs the constructed `newUsers` array via `console.debug('newUsers: ', JSON.stringify(newUsers, undefined, 2))` before insert — intentional live-debugging output per repo convention, not to be stripped. Called from `signUp` (`src/graphQL/schema/mutations/signUp.mts`) only after `userExist` has confirmed the email is free, inside the same `mongoose.startSession()` / `session.withTransaction(...)` block. Depends on `emailHash` (`@lib/emailHash.mjs`) and `encryptPassword` (`@lib/encryptPassword.mjs`) — neither is part of this file's exports.

## `userExist`

**Import:** `import { userExist } from '@axiumine/koa-utils/lib/db/userExist'`

**Signature:**
```ts
async function userExist(uEmail: string, session: ClientSession)
```

Checks whether a user with the given email already exists in the `user` collection. Runs `UserBase.findOne({ 'login.email': uEmail }, '_id').session(session).lean()` (projecting only `_id`, executed within the supplied session) and returns whether a document was found.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| uEmail | string | The email to look up against `login.email` |
| session | ClientSession | An active Mongoose `ClientSession` the lookup is scoped to |

**Returns:** `Promise<boolean>` — `true` if a matching `UserBase` document exists, `false` if `findOne` returned `null`.

**Notes:** Used as the first step of `signUp` (`src/graphQL/schema/mutations/signUp.mts`), inside the transaction, before `registerNewUser` is called. When it returns `true`, `signUp` deliberately sends an "email already valid" notification **and** throws `throwConflictError()` (409) — a privacy/timing trade-off documented at the mutation level, not inside this function.
