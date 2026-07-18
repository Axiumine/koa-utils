# GraphQL — Object & Input Types

This section documents the reusable `GraphQLObjectType` / `GraphQLInputObjectType` building blocks used across the package's mutations and queries, plus the `IFindAndUpdate<T>` TypeScript interface that types the raw result of Mongoose's `findOneAndUpdate` (legacy driver shape). The object types are small, single-purpose return shapes (`SaveType`, `DoneType`, `LoginType`, ...) meant to be composed into resolver `type` fields; `GraphQLInputLogin` is the one input type, used as a mutation `args` shape for email/password login.

## `GraphQLInputLogin`

**Import:** `import { GraphQLInputLogin } from '@axiumine/koa-utils/graphQL/schema/GraphQLInput/GraphQLInputLogin'`

**Signature:**
```ts
export const GraphQLInputLogin = new GraphQLInputObjectType({
	name: 'GraphQLInputLogin',
	fields: () => ({
		email: { type: new GraphQLNonNull(GraphQLString) },
		password: { type: new GraphQLNonNull(GraphQLString) }
	})
})
```

A `GraphQLInputObjectType` bundling the two fields required to authenticate a user by credentials. Used as the `args` (or nested inside an `args` object) of login-family mutations (e.g. `loginRememberme`, `login4Ever`, `loginAdmin`). Both fields are non-null strings; the resolver is still responsible for calling `checkEmailLen` / `checkPwdLen` and lower-casing/trimming the email before use — this type performs no validation itself.

**Fields:**

| Name | GraphQL Type | Description |
|---|---|---|
| email | `GraphQLNonNull(GraphQLString)` | User email, required. |
| password | `GraphQLNonNull(GraphQLString)` | Plaintext password as submitted by the client, required. |

## `IFindAndUpdate<T>`

**Import:** `import { IFindAndUpdate } from '@axiumine/koa-utils/graphQL/schema/interfaces/IFindAndUpdate'`

**Signature:**
```ts
export interface IFindAndUpdate<T = unknown> {
	value: T | null
	lastErrorObject: {
		updatedExisting: boolean
		upserted?: Types.ObjectId
	}
	ok: 0 | 1
}
```

A generic TypeScript interface (not a GraphQL type) describing the legacy raw result object returned by Mongoose's `findOneAndUpdate`-style commands when cast explicitly, e.g. `const result = await Model.findByIdAndUpdate(...) as IFindAndUpdate<IImprenditoreModel>`. If neither the new nor the old document is needed, the source comment recommends using `updateOne()` instead. `ok` being `1` only indicates the MongoDB command itself succeeded — it is `1` even when no matching document was found, so callers must check `value !== null` to know whether a document was actually located.

**Properties:**

| Name | Type | Description |
|---|---|---|
| value | `T \| null` | The matched/updated document (`Il documento`), or `null` if none was found. |
| lastErrorObject | `{ updatedExisting: boolean; upserted?: Types.ObjectId }` | `updatedExisting` is `true` if an existing document was updated, `false` if one was created via upsert; `upserted` is present only when an upsert actually happened. |
| ok | `0 \| 1` | Whether the MongoDB command itself succeeded (`1`) or errored (`0`) — independent of whether a document was found. |

**Notes:** Generic parameter `T` defaults to `unknown` if not supplied at the call site. Import also brings in `Types` from `mongoose` (peer dependency) for the `upserted` field's `ObjectId` type.

## `DeleteType`

**Import:** `import { DeleteType } from '@axiumine/koa-utils/graphQL/schema/types/DeleteType'`

**Signature:**
```ts
export const DeleteType = new GraphQLObjectType({
	name: 'DeleteType',
	fields: () => ({
		acknowledged: { type: GraphQLBoolean },
		deletedCount: { type: GraphQLInt }
	})
})
```

Mirrors the shape of a MongoDB `deleteOne`/`deleteMany` result (`acknowledged`, `deletedCount`). Use as the `type` of a mutation resolver that deletes documents and wants to pass the driver's result straight through to GraphQL.

**Fields:**

| Name | GraphQL Type | Description |
|---|---|---|
| acknowledged | `GraphQLBoolean` | Whether the delete command was acknowledged by the server. |
| deletedCount | `GraphQLInt` | Number of documents deleted. |

## `RET_DEL_ROLLBACK`

**Import:** `import { RET_DEL_ROLLBACK } from '@axiumine/koa-utils/graphQL/schema/types/DeleteType'`

**Signature:**
```ts
export const RET_DEL_ROLLBACK = {
	acknowledged: false,
	deletedCount: 0
}
```

A plain object literal (not a GraphQL type) shaped to match `DeleteType`, intended as the value to return from a mutation resolver when a delete transaction is rolled back (e.g. inside a `mongoose.startSession()` / `session.withTransaction(...)` block that fails) so the response still conforms to `DeleteType`'s fields with a "nothing deleted" result.

## `DoneType`

**Import:** `import { DoneType } from '@axiumine/koa-utils/graphQL/schema/types/DoneType'`

**Signature:**
```ts
export const DoneType = new GraphQLObjectType({
	name: 'DoneType',
	fields: () => ({
		done: { type: new GraphQLNonNull(GraphQLBoolean) },
		message: { type: new GraphQLNonNull(GraphQLString) },
		_id: { type: GraphQLID }
	})
})
```

Generic "operation completed" return shape carrying a success flag, a human-readable message, and an optional id of the affected document.

**Fields:**

| Name | GraphQL Type | Description |
|---|---|---|
| done | `GraphQLNonNull(GraphQLBoolean)` | Whether the operation completed successfully. |
| message | `GraphQLNonNull(GraphQLString)` | Human-readable outcome message. |
| _id | `GraphQLID` | Optional id of the affected document; nullable. |

## `FindOneAndUpdateType`

**Import:** `import { FindOneAndUpdateType } from '@axiumine/koa-utils/graphQL/schema/types/FindOneAndUpdateType'`

**Signature:**
```ts
const FindOneAndUpdateDetailType = new GraphQLObjectType({
	name: 'FindOneAndUpdateDetailType',
	fields: () => ({
		updatedExisting: { type: new GraphQLNonNull(GraphQLBoolean) }
	})
})

// I ignore the other data
export const FindOneAndUpdateType = new GraphQLObjectType({
	name: 'FindOneAndUpdateType',
	fields: () => ({
		lastErrorObject: { type: new GraphQLNonNull(FindOneAndUpdateDetailType) }
	})
})
```

GraphQL projection of the `IFindAndUpdate` raw driver result, exposing only `lastErrorObject.updatedExisting` (per the "I ignore the other data" source comment — `value` and `ok` are intentionally not surfaced to GraphQL clients). `FindOneAndUpdateDetailType` is a local, unexported helper type used only as the nested type of `lastErrorObject`.

**Fields:**

| Name | GraphQL Type | Description |
|---|---|---|
| lastErrorObject | `GraphQLNonNull(FindOneAndUpdateDetailType)` | Nested object with a single field, `updatedExisting: GraphQLNonNull(GraphQLBoolean)`, mirroring `IFindAndUpdate.lastErrorObject.updatedExisting`. |

## `LoginAppType`

**Import:** `import { LoginAppType } from '@axiumine/koa-utils/graphQL/schema/types/LoginAppType'`

**Signature:**
```ts
// returns null id if it fails to save
export const LoginAppType = new GraphQLObjectType({
	name: 'LoginAppType',
	fields: () => ({
		accessToken: { type: new GraphQLNonNull(GraphQLString) },
		onboardingStep: { type: new GraphQLNonNull(GraphQLString) },
		onboardingDone: { type: new GraphQLNonNull(GraphQLBoolean) }
	})
})
```

Return shape for app-flavored login mutations that, alongside the access token, also report onboarding progress (current step and whether onboarding is complete).

**Fields:**

| Name | GraphQL Type | Description |
|---|---|---|
| accessToken | `GraphQLNonNull(GraphQLString)` | Issued access token (`access:<uuid>` style). |
| onboardingStep | `GraphQLNonNull(GraphQLString)` | Current onboarding step identifier for the user. |
| onboardingDone | `GraphQLNonNull(GraphQLBoolean)` | Whether the user has completed onboarding. |

**Notes:** The file carries a `// returns null id if it fails to save` comment, but this type has no `_id` field at all — the comment appears to be copy-pasted from `SaveType`/similar files and does not describe this type's actual fields. Preserved here verbatim rather than silently removed.

## `LoginType`

**Import:** `import { LoginType } from '@axiumine/koa-utils/graphQL/schema/types/LoginType'`

**Signature:**
```ts
// returns null id if it fails to save
export const LoginType = new GraphQLObjectType({
	name: 'LoginType',
	fields: () => ({
		accessToken: { type: new GraphQLNonNull(GraphQLString) }
	})
})
```

Minimal login return shape carrying only the access token. Used by simpler login mutations that don't need onboarding state (contrast with `LoginAppType`).

**Fields:**

| Name | GraphQL Type | Description |
|---|---|---|
| accessToken | `GraphQLNonNull(GraphQLString)` | Issued access token. |

**Notes:** Same stray `// returns null id if it fails to save` comment as `LoginAppType`; this type has no id field either.

## `MidNameType`

**Import:** `import { MidNameType } from '@axiumine/koa-utils/graphQL/schema/types/MidNameType'`

**Signature:**
```ts
/**
 * MongoDB _id & name
 */
export const MidNameType = new GraphQLObjectType({
	name: 'MidNameType',
	fields: () => ({
		_id: { type: new GraphQLNonNull(GraphQLID) },
		name: { type: new GraphQLNonNull(GraphQLString) }
	})
})
```

Generic MongoDB `_id` + `name` pair, for lookups/lists where only an id and a display name are needed (e.g. dropdown/select options backed by a Mongo collection).

**Fields:**

| Name | GraphQL Type | Description |
|---|---|---|
| _id | `GraphQLNonNull(GraphQLID)` | MongoDB document id. |
| name | `GraphQLNonNull(GraphQLString)` | Display name. |

## `OnlyIdType`

**Import:** `import { OnlyIdType } from '@axiumine/koa-utils/graphQL/schema/types/OnlyIdType'`

**Signature:**
```ts
export const OnlyIdType = new GraphQLObjectType({
	name: 'OnlyIdType',
	fields: () => ({
		_id: { type: new GraphQLNonNull(GraphQLID) }
	})
})
```

Bare id-only return shape, for mutations whose only useful result is the id of the affected/created document.

**Fields:**

| Name | GraphQL Type | Description |
|---|---|---|
| _id | `GraphQLNonNull(GraphQLID)` | The document's id, required. |

## `RefreshType`

**Import:** `import { RefreshType } from '@axiumine/koa-utils/graphQL/schema/types/RefreshType'`

**Signature:**
```ts
// returns null id if it fails to save
export const RefreshType = new GraphQLObjectType({
	name: 'RefreshType',
	fields: () => ({
		status: { type: new GraphQLNonNull(GraphQLBoolean) },
		accessToken: { type: new GraphQLNonNull(GraphQLString) }
	})
})
```

Return shape for the token `refresh` mutation: a success flag plus the newly-issued access token (paired with a rotated refresh token set via cookie, per the auth flow's rotate-both-tokens behavior).

**Fields:**

| Name | GraphQL Type | Description |
|---|---|---|
| status | `GraphQLNonNull(GraphQLBoolean)` | Whether the refresh succeeded. |
| accessToken | `GraphQLNonNull(GraphQLString)` | Newly issued access token. |

**Notes:** Same stray `// returns null id if it fails to save` comment as `LoginType`/`LoginAppType`; not applicable to this type's actual fields.

## `RetStatusMexType`

**Import:** `import { RetStatusMexType } from '@axiumine/koa-utils/graphQL/schema/types/RetStatusMexType'`

**Signature:**
```ts
export const RetStatusMexType = new GraphQLObjectType({
	name: 'RetStatusMexType',
	fields: () => ({
		status: { type: new GraphQLNonNull(GraphQLString) },
		mex: { type: GraphQLString }
	})
})
```

Status-plus-optional-message return shape, for operations that report a status string and may attach a human-readable message (`mex`, Italian abbreviation for "messaggio").

**Fields:**

| Name | GraphQL Type | Description |
|---|---|---|
| status | `GraphQLNonNull(GraphQLString)` | Required status string. |
| mex | `GraphQLString` | Optional message text. |

## `RetStatusType`

**Import:** `import { RetStatusType } from '@axiumine/koa-utils/graphQL/schema/types/RetStatusType'`

**Signature:**
```ts
export const RetStatusType = new GraphQLObjectType({
	name: 'RetStatusType',
	fields: () => ({
		status: { type: new GraphQLNonNull(GraphQLString) }
	})
})
```

Bare status-string return shape, for operations that only need to report an outcome status with no accompanying message (contrast with `RetStatusMexType`).

**Fields:**

| Name | GraphQL Type | Description |
|---|---|---|
| status | `GraphQLNonNull(GraphQLString)` | Required status string. |

## `SaveType`

**Import:** `import { SaveType } from '@axiumine/koa-utils/graphQL/schema/types/SaveType'`

**Signature:**
```ts
// returns null id if it fails to save
export const SaveType = new GraphQLObjectType({
	name: 'SaveType',
	fields: () => ({
		_id: { type: GraphQLID }
	})
})
```

Return shape for save/create operations that only need to report the resulting document id. Unlike `OnlyIdType`, `_id` is **nullable** here — per the source comment, a `null` id signals that the save failed.

**Fields:**

| Name | GraphQL Type | Description |
|---|---|---|
| _id | `GraphQLID` | Id of the saved document, or `null` if the save failed. |

## `SidNameType`

**Import:** `import { SidNameType } from '@axiumine/koa-utils/graphQL/schema/types/SidNameType'`

**Signature:**
```ts
/**
 * MariaDB id & name
 */
export const SidNameType = new GraphQLObjectType({
	name: 'SidNameType',
	fields: () => ({
		id: { type: new GraphQLNonNull(GraphQLInt) },
		name: { type: new GraphQLNonNull(GraphQLString) }
	})
})
```

MariaDB-flavored id + name pair (`id: GraphQLInt`, contrast with Mongo's `MidNameType` which uses `_id: GraphQLID`). For lookups/lists backed by a MariaDB/SQL table with an integer primary key.

**Fields:**

| Name | GraphQL Type | Description |
|---|---|---|
| id | `GraphQLNonNull(GraphQLInt)` | MariaDB integer id. |
| name | `GraphQLNonNull(GraphQLString)` | Display name. |

## `SidNomeType`

**Import:** `import { SidNomeType } from '@axiumine/koa-utils/graphQL/schema/types/SidNomeType'`

**Signature:**
```ts
/**
 * MariaDB id & nome
 */
export const SidNomeType = new GraphQLObjectType({
	name: 'SidNomeType',
	fields: () => ({
		id: { type: new GraphQLNonNull(GraphQLInt) },
		nome: { type: new GraphQLNonNull(GraphQLString) }
	})
})
```

Italian-named twin of `SidNameType`: MariaDB integer id + `nome` (Italian for "name"), for data sources/consumers that expect the Italian field name instead of `name`.

**Fields:**

| Name | GraphQL Type | Description |
|---|---|---|
| id | `GraphQLNonNull(GraphQLInt)` | MariaDB integer id. |
| nome | `GraphQLNonNull(GraphQLString)` | Display name (Italian: "nome"). |

## `UpdateResultType`

**Import:** `import { UpdateResultType } from '@axiumine/koa-utils/graphQL/schema/types/UpdateResultType'`

**Signature:**
```ts
// returns null id if it fails to save
export const UpdateResultType = new GraphQLObjectType({
	name: 'UpdateResultType',
	fields: () => ({
		modifiedCount: { type: new GraphQLNonNull(GraphQLInt) }
	})
})
```

Return shape for update operations that only need to report how many documents were modified (mirrors the `modifiedCount` field of a MongoDB `updateOne`/`updateMany` result).

**Fields:**

| Name | GraphQL Type | Description |
|---|---|---|
| modifiedCount | `GraphQLNonNull(GraphQLInt)` | Number of documents modified by the update. |

**Notes:** Same stray `// returns null id if it fails to save` comment as `LoginType`/`LoginAppType`/`RefreshType`; this type has no id field.
