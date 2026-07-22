# GraphQL — Mongoose Models

This section documents the package's Mongoose models: the `Schema`/`model()` pairs (plus their typing interfaces) that define what gets persisted to MongoDB. `UserBase` is the core user document (collection `user`) backing signup/login/account state. The four `log/*` models are write-mostly logging collections used for observability: `DevStatsGraphQLCalls` batches per-resolver hit counters, `LogGlobalError` records uncaught error stack traces, `LogStatsGraphql` records per-call timing/status, and `LogThrow` records deliberately-thrown GraphQL errors with a severity level. All five files live under `src/graphQL/models/MongoDB/` and are each their own `package.json` export subpath — there is no barrel.

## `IInfoUserForLogin`

**Import:** `import { IInfoUserForLogin } from '@axiumine/koa-utils/graphQL/models/MongoDB/UserBase'`

**Signature:**
```ts
export interface IInfoUserForLogin {
	_id: Types.ObjectId
	login: {
		password: string
		lastLogin?: Date
	}
	account: {
		email: {
			valid: boolean
		}
		onboardingStep?: string
		onboardingDone?: boolean
		rememberMe?: boolean
		disabled?: boolean
		deleted?: boolean
	}
}
```

A narrower TypeScript typing of a `UserBase` document, exposing only the fields relevant to authenticating and gating a login (password hash, last-login timestamp, email-validity flag, onboarding/remember-me flags, account disabled/deleted flags). Intended for typing a projected fetch (e.g. `.select(...)` / `.lean()`) where the full `IUserBaseSchema` shape is not needed.

**Fields:**

| Name | Type | Description |
|---|---|---|
| _id | `Types.ObjectId` | Document id. |
| login.password | `string` | Bcrypt password hash to compare against the submitted credential. |
| login.lastLogin | `Date` (optional) | Timestamp of the previous successful login. |
| account.email.valid | `boolean` | Whether the account's email has completed verification. |
| account.onboardingStep | `string` (optional) | Current onboarding step key. |
| account.onboardingDone | `boolean` (optional) | Whether onboarding has completed. |
| account.rememberMe | `boolean` (optional) | Whether the session should use the long-lived "remember me" flow. |
| account.disabled | `boolean` (optional) | Whether the account is administratively disabled. |
| account.deleted | `boolean` (optional) | Whether the account is soft-deleted. |

**Notes:** Purely a TypeScript interface — it has no corresponding `Schema`/`model()` of its own; it exists to type a subset projection of the same `user` collection backing `UserBase`.

## `IUserBaseSchema`

**Import:** `import { IUserBaseSchema } from '@axiumine/koa-utils/graphQL/models/MongoDB/UserBase'`

**Signature:**
```ts
export interface IUserBaseSchema {
	_id: Types.ObjectId
	login: {
		_id?: boolean
		email: string
		password: string
		firstLogin?: Date
		lastLogin?: Date
	}
	account: {
		_id?: boolean
		email: {
			_id?: boolean
			valid: boolean
			dateLastReq?: Date
			requestTimes?: number
			hash?: string
			newEmailTmp?: string
		}
		onboardingStep?: string
		onboardingDone?: boolean
		rememberMe?: boolean
		registrationDate: Date
		accountValidDate?: Date
		newsletter?: boolean
		resetDateReq?: Date
		resetHash?: string
		disabled?: boolean
		deleted?: boolean
	}
	personalData?: {
		_id: false
		name: string
	}
	__v?: number
}
```

The full document shape stored in the `user` collection: credentials/login timestamps, the account lifecycle state (email verification, onboarding, registration/validity dates, newsletter opt-in, reset requests, disabled/deleted flags), and an optional `personalData.name`. This is the generic type parameter passed to `Schema<IUserBaseSchema>` / `model<IUserBaseSchema>` for `UserBase`.

**Fields:**

| Name | Type | Description |
|---|---|---|
| _id | `Types.ObjectId` | Document id. |
| login.email | `string` | Login email (required in the schema). |
| login.password | `string` | Bcrypt password hash (required in the schema). |
| login.firstLogin | `Date` (optional) | First successful login timestamp. |
| login.lastLogin | `Date` (optional) | Most recent successful login timestamp. |
| account.email.valid | `boolean` | Whether the email has been verified (required in the schema). |
| account.email.dateLastReq | `Date` (optional) | Date of the last verification/change request. |
| account.email.requestTimes | `number` (optional) | Count of verification/change requests made. |
| account.email.hash | `string` (optional) | Verification hash sent to the user's email — signup activation and email-change **only**, never password reset. |
| account.email.newEmailTmp | `string` (optional) | Pending new email address awaiting confirmation. |
| account.onboardingStep | `string` (optional) | Current onboarding step key. |
| account.onboardingDone | `boolean` (optional) | Whether onboarding has completed. |
| account.rememberMe | `boolean` (optional) | Whether the account uses the long-lived "remember me" login flow. |
| account.registrationDate | `Date` | Account creation date (required in the schema). |
| account.accountValidDate | `Date` (optional) | Date the account/email became valid. |
| account.newsletter | `boolean` (optional) | Newsletter opt-in flag. |
| account.resetDateReq | `Date` (optional) | Date of the last password-reset request. |
| account.resetHash | `string` (optional) | Password-reset token, written by `saveResetReq` and cleared by `removeResetReq`. Separate from `account.email.hash` — see Notes. |
| account.disabled | `boolean` (optional) | Administrative disable flag. Was `type: String` in the schema through 5.0.3 — see Notes, stored data needs a migration. |
| account.deleted | `boolean` (optional) | Soft-delete flag. |
| personalData.name | `string` (optional subdocument) | User's display/personal name, if `personalData` is present. |
| __v | `number` (optional) | Mongoose version key. |

**Notes:** `account.resetHash` and `account.email.hash` are two distinct tokens and must never be read or written interchangeably. They differ in lifetime (60 minutes vs 3 days), throttle (10 minutes vs `account.email.requestTimes`) and trust domain: `account.email.hash` proves control of an inbox, `account.resetHash` authorises a password change. They shared one field through 5.0.3, which meant an unauthenticated `resetPwd` call silently invalidated a pending activation link (each click on the now-dead link bumping `requestTimes` towards the 5-strike account deletion in `handleIfTooMuchRequestsTimes`), and a hash minted by either flow was accepted by the other.

`account.disabled` is `type: Boolean`, matching the interface. It was declared `type: String` through 5.0.3 (while `account.deleted` right next to it was already `Boolean`), and that inverted the flag rather than merely mistyping it. Mongoose casts on write and on hydrated reads, so a stored boolean `false` came back as the string `'false'` — truthy — and every consumer tests the flag with a bare `if (account.disabled)`. `infoUserForLogin` reads with `.exec()`, not `.lean()`, so `_finalizeLoginCheck` saw `'false'` and answered a `403` plus an "account disabled" email to a user explicitly marked **not** disabled. Writing `false` back through Mongoose stored the string too, so the flag could not be cleared through this model at all. Only an absent field behaved. The library never writes `disabled` itself, which is why the defect stayed latent: operators only ever wrote `true`.

Fixing the schema does not fix the stored data. Hydrated reads now cast a legacy `'false'` back to `false`, but `.lean()` readers (`userData4VerifyEmail`, `emailChangeHashVerify`) bypass casting entirely and still see the raw string. Run `scripts/migrate-account-disabled-to-boolean.mjs` once per database as part of the upgrade — the code reads these flags raw and deliberately does not coerce.

## `UserBase`

**Import:** `import { UserBase } from '@axiumine/koa-utils/graphQL/models/MongoDB/UserBase'`

**Signature:**
```ts
const UserBaseSchema: Schema<IUserBaseSchema> = new Schema(
	{
		login: { type: { _id: false, email: {...}, password: {...}, firstLogin: {...}, lastLogin: {...} }, required: true },
		account: { type: { _id: false, email: {...}, onboardingStep: {...}, onboardingDone: {...}, rememberMe: {...}, registrationDate: {...}, accountValidDate: {...}, newsletter: {...}, resetDateReq: {...}, resetHash: {...}, disabled: {...}, deleted: {...} }, required: true },
		personalData: { type: { _id: false, name: {...} }, required: false },
		__v: { type: Number, required: false }
	},
	{
		collection: 'user'
	}
)

const UserBase = model<IUserBaseSchema>('UserBase', UserBaseSchema)
```

The core user document model — the record created by `signUp`, authenticated by `login*` mutations, and mutated by onboarding/account-management flows. Backed by collection **`user`**. Field shape matches `IUserBaseSchema` above (see that section's Fields table for the full breakdown); `login` and `account` are both required embedded subdocuments with `_id` disabled (`_id: false`), and `personalData` is an optional embedded subdocument (also `_id: false`).

**Returns:** `Model<IUserBaseSchema>` — the compiled Mongoose model, used as `UserBase.findOne(...)`, `UserBase.create(...)`, etc.

**Notes:** Collection name is explicitly `user` (not the pluralized/lowercased default Mongoose would derive from `'UserBase'`). See `IUserBaseSchema` for the `account.disabled` type change and the migration it requires.

## `IDevStatsGraphQLCalls`

**Import:** `import { IDevStatsGraphQLCalls } from '@axiumine/koa-utils/graphQL/models/MongoDB/log/DevStatsGraphQLCalls'`

**Signature:**
```ts
export interface IDevStatsGraphQLCalls {
	name: string
	hit?: boolean
}
```

A single-entry typing for one item that gets pushed into a `DevStatsGraphQLCalls.list` array — a resolver/operation `name` plus an optional `hit` flag. Used by call sites that build up a stats entry before it is embedded in the document's `list` array (where each stored item additionally carries a Mongo-assigned `_id`).

**Fields:**

| Name | Type | Description |
|---|---|---|
| name | `string` | Name of the GraphQL operation/resolver being tracked. |
| hit | `boolean` (optional) | Whether this call was recorded as a "hit" (e.g. dev-stats counter). |

## `IDevStatsGraphQLCallsSchema`

**Import:** `import { IDevStatsGraphQLCallsSchema } from '@axiumine/koa-utils/graphQL/models/MongoDB/log/DevStatsGraphQLCalls'`

**Signature:**
```ts
export interface IDevStatsGraphQLCallsSchema {
	_id: Types.ObjectId
	list: [
		{
			_id?: Types.ObjectId
			name: string
			hit?: boolean
		}
	]
	dataora: Date
	__v?: number
}
```

The full document shape for the `devStatsGraphQLCalls` collection: a single array field (`list`) of per-call entries, plus an insertion timestamp (`dataora`, Italian for "date/time"). This is the generic type parameter passed to `Schema<IDevStatsGraphQLCallsSchema>` / `model<IDevStatsGraphQLCallsSchema>` for `DevStatsGraphQLCalls`.

**Fields:**

| Name | Type | Description |
|---|---|---|
| _id | `Types.ObjectId` | Document id. |
| list | `[{ _id?: Types.ObjectId, name: string, hit?: boolean }]` | Required array of per-call stat entries. |
| dataora | `Date` | Insertion timestamp; defaults to `new Date()` at creation time (see Notes). |
| __v | `number` (optional) | Mongoose version key. |

**Notes:** Despite being typed as required (`dataora: Date`, no `?`) on the interface, the schema field is declared `required: false` with `default: () => new Date()`, so a fresh `Date` is generated per document if the caller does not supply one.

## `DevStatsGraphQLCalls`

**Import:** `import { DevStatsGraphQLCalls } from '@axiumine/koa-utils/graphQL/models/MongoDB/log/DevStatsGraphQLCalls'`

**Signature:**
```ts
const DevStatsGraphQLCallsSchema = new Schema<IDevStatsGraphQLCallsSchema>(
	{
		list: {
			type: [
				{
					_id: { type: Schema.Types.ObjectId, required: true },
					name: { type: String, required: true },
					hit: { type: Boolean, required: false }
				}
			],
			required: true
		},
		dataora: {
			type: Date,
			required: false,
			default: () => new Date() // Ensure a new Date is generated for each document.
		},
		__v: { type: Number, required: false }
	},
	{
		collection: 'devStatsGraphQLCalls'
	}
)

const DevStatsGraphQLCalls = model<IDevStatsGraphQLCallsSchema>('DevStatsGraphQLCalls', DevStatsGraphQLCallsSchema)
```

A dev/observability logging model that batches GraphQL call hit-counters into a single document's `list` array (rather than one document per call, as `LogStatsGraphql` does). Backed by collection **`devStatsGraphQLCalls`**.

**Returns:** `Model<IDevStatsGraphQLCallsSchema>` — the compiled Mongoose model.

**Notes:** Each `list` entry requires its own `_id` (`Schema.Types.ObjectId`, `required: true`) — unlike the embedded subdocuments in `UserBase`, `_id` is not disabled here. `dataora` auto-defaults to the current date if omitted.

## `IGlobalErrorGraphqlSchema`

**Import:** `import { IGlobalErrorGraphqlSchema } from '@axiumine/koa-utils/graphQL/models/MongoDB/log/LogGlobalError'`

**Signature:**
```ts
export interface IGlobalErrorGraphqlSchema {
	_id: Types.ObjectId
	m: string // message
	s: Array<string> // stack
	i: Date // inserted
	__v?: number
}
```

The document shape for the `logGlobalError` collection: a short-keyed error record (`m` = message, `s` = stack as an array of strings, `i` = inserted-at timestamp). This is the generic type parameter passed to `Schema<IGlobalErrorGraphqlSchema>` / `model<IGlobalErrorGraphqlSchema>` for `LogGlobalError`.

**Fields:**

| Name | Type | Description |
|---|---|---|
| _id | `Types.ObjectId` | Document id. |
| m | `string` | Error message. |
| s | `Array<string>` | Error stack trace, one entry per line/frame. |
| i | `Date` | Insertion timestamp; defaults to `new Date()` at creation time. |
| __v | `number` (optional) | Mongoose version key. |

## `LogGlobalError`

**Import:** `import { LogGlobalError } from '@axiumine/koa-utils/graphQL/models/MongoDB/log/LogGlobalError'`

**Signature:**
```ts
const GlobalErrorGraphqlSchema = new Schema<IGlobalErrorGraphqlSchema>(
	{
		m: { type: String, required: true },
		s: { type: [String], required: true },
		i: {
			type: Date,
			required: false,
			default: () => new Date() // Ensure a new Date is generated for each document.
		},
		__v: { type: Number, required: false }
	},
	{
		collection: 'logGlobalError'
	}
)

const LogGlobalError = model<IGlobalErrorGraphqlSchema>('LogGlobalError', GlobalErrorGraphqlSchema)
```

A global uncaught-error logging model — stores an error message plus its stack trace (split into an array of strings). Backed by collection **`logGlobalError`**.

**Returns:** `Model<IGlobalErrorGraphqlSchema>` — the compiled Mongoose model.

**Notes:** `m` and `s` are both required; `i` auto-defaults to the current date if omitted.

## `LogStatsGraphql`

**Import:** `import { LogStatsGraphql } from '@axiumine/koa-utils/graphQL/models/MongoDB/log/LogStatsGraphql'`

**Signature:**
```ts
const StatsGraphqlSchema = new Schema<IStatsGraphqlSchema>(
	{
		u: { type: Number, required: true },
		n: { type: String, required: true },
		s: { type: Number, required: true },
		m: { type: Number, required: true },
		i: {
			type: Date,
			required: false,
			default: () => new Date() // Ensure a new Date is generated for each document.
		},
		__v: { type: Number, required: false }
	},
	{
		collection: 'logStatsGraphql'
	}
)

const LogStatsGraphql = model<IStatsGraphqlSchema>('LogStatsGraphql', StatsGraphqlSchema)
```

A per-call GraphQL stats logging model — one document per resolved operation, recording the user id, operation name, HTTP/GraphQL status, and total elapsed milliseconds. Backed by collection **`logStatsGraphql`**.

**Fields:**

| Name | Type | Description |
|---|---|---|
| _id | `Types.ObjectId` | Document id. |
| u | `number` | User (numeric user identifier). |
| n | `string` | Query/operation name. |
| s | `number` | Status (e.g. resolved status code). |
| m | `number` | Total elapsed time in milliseconds ("msTot"). |
| i | `Date` | Insertion timestamp; defaults to `new Date()` at creation time. |
| __v | `number` (optional) | Mongoose version key. |

**Returns:** `Model<IStatsGraphqlSchema>` — the compiled Mongoose model.

**Notes:** The backing interface `IStatsGraphqlSchema` (shown implicitly in the Fields table above) is exported alongside the model. It was module-private until a consumer re-exporting `LogStatsGraphql` — `export const models = { LogStatsGraphql }` — failed declaration emit with `TS4023: … has or is using name 'IStatsGraphqlSchema' … but cannot be named`, because the model's type mentions an interface the consumer's `.d.ts` had no way to reference.

## `ILogThrowGraphqlSchema`

**Import:** `import { ILogThrowGraphqlSchema } from '@axiumine/koa-utils/graphQL/models/MongoDB/log/LogThrow'`

**Signature:**
```ts
export interface ILogThrowGraphqlSchema {
	_id: Types.ObjectId
	u: number // user
	m: string // message
	el: number // error level
	i: Date // inserted
	__v?: number
}
```

The document shape for the `logThrow` collection: records a deliberately-thrown GraphQL error against a user id, with a message and an error-level severity. This is the generic type parameter passed to `Schema<ILogThrowGraphqlSchema>` / `model<ILogThrowGraphqlSchema>` for `LogThrow`.

**Fields:**

| Name | Type | Description |
|---|---|---|
| _id | `Types.ObjectId` | Document id. |
| u | `number` | User (numeric user identifier). |
| m | `string` | Error message. |
| el | `number` | Error level (severity). |
| i | `Date` | Insertion timestamp; defaults to `new Date()` at creation time. |
| __v | `number` (optional) | Mongoose version key. |

## `LogThrow`

**Import:** `import { LogThrow } from '@axiumine/koa-utils/graphQL/models/MongoDB/log/LogThrow'`

**Signature:**
```ts
const LogThrowGraphqlSchema = new Schema<ILogThrowGraphqlSchema>(
	{
		u: { type: Number, required: true },
		m: { type: String, required: true },
		el: { type: Number, required: true },
		i: {
			type: Date,
			required: false,
			default: () => new Date() // Ensure a new Date is generated for each document.
		},
		__v: { type: Number }
	},
	{
		collection: 'logThrow'
	}
)

const LogThrow = model<ILogThrowGraphqlSchema>('LogThrow', LogThrowGraphqlSchema)
```

A thrown-error logging model — records deliberate `throwGraphQLError`-style errors (via `logThrow` in `@lib/db/log/logThrow`) against a user id, with a message and severity level. Backed by collection **`logThrow`**.

**Returns:** `Model<ILogThrowGraphqlSchema>` — the compiled Mongoose model.

**Notes:** `__v` here has no `required` key set at all (unlike the other four models, which all explicitly set `required: false` on `__v`) — functionally equivalent (optional), but a minor inconsistency worth noting if refactoring these schemas for consistency.
