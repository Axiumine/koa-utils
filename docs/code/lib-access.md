# Lib — Model-Agnostic Access Flows

Added in **5.3.0**. The password-reset and email-verification flows used to be hard-wired to the `UserBase` model: the collection name `user` and every field path (`login.email`, `account.resetHash`, `account.email.valid`, …) were baked into the private DB helpers. Any consumer whose accounts live in another collection, or under another field tree, could not use `resetPwd`, `updatePassword` or the verify-email chain at all — the queries matched nothing and the flow silently no-opped.

The two factories here build the same flows against **any** Mongoose model, with a caller-supplied map of field paths. Nothing about the behaviour changes: the existing exports (`resetPwd`, `updatePassword`, `emailChangeHashVerify`, `routerVerifyEmail`) are these factories applied to `UserBase` with the default maps, so an existing consumer that upgrades sees no difference.

| Export | Import path |
|---|---|
| `createResetPwdFlow` | `@axiumine/koa-utils/lib/access/createResetPwdFlow` |
| `createVerifyEmailFlow` | `@axiumine/koa-utils/lib/access/createVerifyEmailFlow` |
| `IResetPwdPaths`, `DEFAULT_RESET_PWD_PATHS`, `resolveResetPwdPaths`, `IVerifyEmailPaths`, `DEFAULT_VERIFY_EMAIL_PATHS`, `resolveVerifyEmailPaths`, `TAccessModel` | `@axiumine/koa-utils/lib/access/accessPaths` |

## `createResetPwdFlow`

**Import:** `import { createResetPwdFlow } from '@axiumine/koa-utils/lib/access/createResetPwdFlow'`

**Signature:**
```ts
export interface ICreateResetPwdFlowArgs {
	model: TAccessModel                  // any mongoose Model
	paths?: Partial<IResetPwdPaths>      // only the keys that differ from the default layout
}

export interface IResetPwdFlow {
	resetPwd: TResetPwdMutation
	updatePassword: TUpdatePasswordMutation
}

export const createResetPwdFlow: (args: ICreateResetPwdFlowArgs) => IResetPwdFlow
```

Returns the two password-reset mutations, bound to `model` and the resolved path map. Both are ordinary `{ description, type, args, resolve }` objects — drop them straight into a schema's `Mutation` fields, exactly like the package-level `resetPwd` / `updatePassword`. Behaviour, status codes, throttles, privacy properties and post-commit email handling are documented in [GraphQL — Mutations](./graphql-mutations.md) and are identical.

**Example:**
```ts
import { createResetPwdFlow } from '@axiumine/koa-utils/lib/access/createResetPwdFlow'

const { resetPwd, updatePassword } = createResetPwdFlow({
	model: Account,
	paths: {
		email: 'mail',
		password: 'pwd',
		name: 'profile.fullName',
		resetDateReq: 'resetPwd.resetDateReq',
		resetHash: 'resetPwd.resetHash',
		resetClear: ['resetPwd']
	}
})
```

### `IResetPwdPaths`

Every value is a dotted Mongo path into the account document. Every key is optional in the `paths` argument and falls back to `DEFAULT_RESET_PWD_PATHS`.

| Key | Default | Used for |
|---|---|---|
| `email` | `login.email` | Lookup filter of `getResetPwd` and of the cleanup write |
| `password` | `login.password` | Bcrypt hash slot `updatePassword` overwrites |
| `name` | `personalData.name` | Display name passed to the reset / confirmation emails; missing ⇒ `''` |
| `resetDateReq` | `account.resetDateReq` | Drives the 10-minute throttle and the 60-minute link expiry |
| `resetHash` | `account.resetHash` | Password-reset token |
| `resetClear` | `['account.resetDateReq', 'account.resetHash']` | Paths `removeResetReq` `$unset`s once a reset is consumed |

`resetHash` must stay disjoint from `IVerifyEmailPaths.hash`. While the two shared one slot (through 5.0.3), a hash issued by either flow authenticated the other, and one unauthenticated `resetPwd` call killed a pending activation link.

### Why `resetClear` is a separate key

It is **not** derived from `resetDateReq` + `resetHash`, and it is not always the same list. A layout that stores the request as one all-or-nothing subdocument —

```
resetPwd: { resetDateReq: Date, resetHash: String(50) }   // both required if present
```

— under `validationLevel: 'strict'` / `validationAction: 'error'` rejects a write that unsets a single member: the leftover document fails validation. The only legal cleanup there is `$unset: { resetPwd: '' }`, one container path rather than two leaf paths. A flat layout never hits this, so deriving the list from the leaves would look correct and make the strict layout impossible to express. `removeResetReq` unsets exactly what `resetClear` names, never the fields it read.

## `createVerifyEmailFlow`

**Import:** `import { createVerifyEmailFlow } from '@axiumine/koa-utils/lib/access/createVerifyEmailFlow'`

**Signature:**
```ts
export interface ICreateVerifyEmailFlowArgs {
	model: TAccessModel
	paths?: Partial<IVerifyEmailPaths>
}

export interface IVerifyEmailFlow {
	userData4VerifyEmail: TUserData4VerifyEmail
	setEmailHash: TSetEmailHash
	enableEmailAccess: TEnableEmailAccess
	confirmNewEmail: TConfirmNewEmail
	deleteUserByEmail: TDeleteUserByEmail
	incReqTimes: TIncReqTimes
	assertVerifyEmailAllowed: TAssertVerifyEmailAllowed
	emailChangeHashVerify: TEmailChangeHashVerifyMutation
	routerVerifyEmail: TVerifyEmailRouter
}

export const createVerifyEmailFlow: (args: ICreateVerifyEmailFlowArgs) => IVerifyEmailFlow
```

Returns the whole email-verification chain bound to one model and one path map — the reader, the writers, the guard chain, the `emailChangeHashVerify` mutation and the Koa router handler. The guards are wired to the same model, so the five-strike account delete and the 3-day link expiry act on the caller's collection rather than on `user`.

Only `emailChangeHashVerify` and `routerVerifyEmail` have package-level equivalents that a consumer imports directly; the rest back them and are otherwise internal (see [Internal Helpers](./internal.md)). They are returned here because a consumer replacing the model needs the same primitives its own sign-up flow calls — `setEmailHash` in particular, which issues the activation hash.

**Example:**
```ts
import { createVerifyEmailFlow } from '@axiumine/koa-utils/lib/access/createVerifyEmailFlow'

const flow = createVerifyEmailFlow({
	model: Account,
	paths: { email: 'mail', valid: 'verified', hash: 'verification.hash', verifyClear: ['verification'] }
})

router.get('/check/verify-email/:email/:hash', flow.routerVerifyEmail())
// schema Mutation fields: { emailChangeHashVerify: flow.emailChangeHashVerify }
```

### `IVerifyEmailPaths`

| Key | Default | Used for |
|---|---|---|
| `email` | `login.email` | Live login address — lookup filter, and the field `confirmNewEmail` writes on an email change |
| `valid` | `account.email.valid` | Flag `enableEmailAccess` flips once a link is honoured |
| `hash` | `account.email.hash` | Verification / email-change token — never the password-reset slot |
| `dateLastReq` | `account.email.dateLastReq` | Drives the 3-day link window |
| `requestTimes` | `account.email.requestTimes` | Strike counter; five wrong hashes delete the account |
| `newEmailTmp` | `account.email.newEmailTmp` | Address awaiting confirmation during an email change |
| `deleted` | `account.deleted` | Account tombstone flag |
| `disabled` | `account.disabled` | Account lockout flag |
| `verifyClear` | `['account.email.hash', 'account.email.dateLastReq', 'account.email.requestTimes']` | Paths `enableEmailAccess` `$unset`s |
| `emailChangeClear` | the three above **plus** `account.email.newEmailTmp` | Paths `confirmNewEmail` `$unset`s |

Both `*Clear` keys follow the same rule as `resetClear`: caller-supplied lists of paths to `$unset`, never derived from the leaves the flow reads, so a strict-subdocument layout can pass its container path.

## `accessPaths`

**Import:** `import { DEFAULT_RESET_PWD_PATHS, resolveResetPwdPaths } from '@axiumine/koa-utils/lib/access/accessPaths'`

**Signature:**
```ts
export type TAccessModel = Model<any>

export const DEFAULT_RESET_PWD_PATHS: IResetPwdPaths          // frozen
export const DEFAULT_VERIFY_EMAIL_PATHS: IVerifyEmailPaths    // frozen

export function resolveResetPwdPaths(paths?: Partial<IResetPwdPaths>): IResetPwdPaths
export function resolveVerifyEmailPaths(paths?: Partial<IVerifyEmailPaths>): IVerifyEmailPaths
```

Both default maps are `Object.freeze`d, lists included, so one consumer cannot mutate the defaults of another. The `resolve*` helpers merge a partial override over the defaults with a plain spread and return a fresh object — a key present with an explicit `undefined` value overrides the default *with* `undefined`, so pass only the keys being changed.

`TAccessModel` is deliberately `Model<any>`: the flows only ever call `findOne`, `updateOne`, `countDocuments` and `deleteOne` with computed field paths, so nothing can be typed against a concrete document shape without forcing every consumer to describe theirs. The path map is what pins the contract instead — a wrong path is a runtime no-op, which is why the defaults are exported and the flows are tested against them.

## Notes for maintainers

- The `UserBase`-bound exports are built by applying these same factories at module load. There is no second code path: `resetPwd` *is* `createResetPwdMutation({ getResetPwd, saveResetReq })` over `UserBase`, and so on down the chain. A behaviour change made in one is made in both.
- The projection strings the flows build (`buildProjection`) are byte-identical to the hand-written ones they replaced when the default paths are used. Every field a resolver reads must appear in the map that builds the projection — a `.lean()` read of a field left out is simply absent, with no error, which is how a missing `account.email.requestTimes` turned every wrong-hash attempt into a 500 through 5.1.0.
- Dotted paths are read out of the lean documents with `readPath` (`src/private/lib/access/pathTools.mts`), which answers `undefined` for any missing or non-object link rather than throwing, so the callers' `typeof x === 'undefined'` guards keep working unchanged.
