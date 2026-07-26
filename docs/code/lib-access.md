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
		deleted: 'state.gone',
		disabled: 'state.locked',
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
| `deleted` | `account.deleted` | Account tombstone flag — a set value makes `getResetPwd` answer `null` |
| `disabled` | `account.disabled` | Account lockout flag — a set value makes `getResetPwd` answer `null` |
| `resetClear` | `['account.resetDateReq', 'account.resetHash']` | Paths `removeResetReq` `$unset`s once a reset is consumed |

`resetHash` must stay disjoint from `IVerifyEmailPaths.hash`. While the two shared one slot (through 5.0.3), a hash issued by either flow authenticated the other, and one unauthenticated `resetPwd` call killed a pending activation link.

### The account-state gate

`deleted` and `disabled` are newer than the rest of the map. Before them the reset flow read no account state at all: `resetPwd` mailed a live reset link to a tombstoned address, and `updatePassword` went on to overwrite the bcrypt slot of a deleted or disabled account — so re-enabling that account later handed it back with a password the requester had chosen. The verify-email flow had carried the same two keys since 5.3.0 and refused both cases; only the reset flow was open.

The gate lives in `getResetPwd`, so both mutations inherit it. A blocked account produces exactly the value an unknown address produces — `null` — which means `resetPwd` still returns `true` and sends nothing, and `updatePassword` still answers the same `403`. No new enumeration oracle is opened, and the two flows now agree on what "this account is gone" means: the defaults point at the same `account.deleted` / `account.disabled` slots the verify-email chain guards.

The flags are read **raw**, exactly as `assertVerifyEmailAllowed` reads them. This is a `.lean()` read, so Mongoose casting never runs and the values are whatever the driver found. On data that has not been through `scripts/migrate-account-disabled-to-boolean.mjs`, a stored `'false'` is a truthy string and blocks the reset; the fix is the migration, not a coercion in the reader.

Pointing these two keys at a field the model does not carry (or at one holding a non-boolean) disables the gate silently — an absent path reads as `undefined`, which is falsy. If your layout has no such flags, that is the intended way to opt out; if it has them under other names, map them.

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
	onAbandon?: TOnAbandon              // 'delete' | 'soft-delete' | 'keep' — default 'delete'
	deletedValue?: unknown              // what 'soft-delete' writes; a function is called per write. Default true
	deleteUserByEmail?: TDeleteUserByEmail   // full override, wins over onAbandon / deletedValue
	mailer?: IVerifyEmailMailer         // default: SocketLabs, debounced by mailThrottle
	mailThrottle?: TMailThrottle        // default: 15 min per address per template. Ignored when mailer is supplied
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

### Abandonment policy — `onAbandon`, `deletedValue`, `deleteUserByEmail`

Two guards dispose of an abandoned registration: the fifth wrong hash (`handleIfTooMuchRequestsTimes`) and a link older than the 3-day window (`handleIfMoreThan3DaysPassed`). Through 5.6.1 that always meant `deleteOne({ [paths.email]: email })`, which is wrong for any row other rows depend on — the package cannot know what a delete costs in a schema it was handed, and a mongo collection has no cascade to fall back on. A registration at the head of a dependent chain has to survive its own expiry.

| `onAbandon` | What the two guards do to the row | Notes |
|---|---|---|
| `'delete'` *(default)* | `model.deleteOne({ [paths.email]: email })` | Behaviour of 5.6.1 and earlier, unchanged. Reports to Sentry when `deletedCount === 0` |
| `'soft-delete'` | `model.updateOne({ [paths.email]: email }, { $set: { [paths.deleted]: deletedValue } }, { runValidators: true })` | The row stays; the account-state guards already reject it, since they only test truthiness |
| `'keep'` | nothing — the writer is a no-op | Disposal becomes the caller's job (a cron sweep, an admin queue) |

`deletedValue` defaults to `true`, matching `UserBase`'s `Boolean` column, and is otherwise written verbatim — a `Date` column takes `deletedValue: () => new Date()`, and the function is called once per write so each row gets the time of its own. It is ignored by the other two modes. Nothing is `$unset` alongside the tombstone: derived unset lists are `verifyClear`'s job and its caller's, for the strict-subdocument reason above.

`deleteUserByEmail` replaces the writer outright and wins over both other keys — use it for a real cascade (`await PuntoVendita.deleteMany(...)` then the row), an audit log, or a queue push.

Whatever the policy, **both guards still throw.** Disposal never decides whether the link is honoured, so a `'keep'` flow answers the same `/x/email-check` redirect a `'delete'` flow does.

`flow.deleteUserByEmail` is the writer the guards hold, not a hook: the factory builds exactly one and both uses it and returns it. Reassigning the returned member after the fact changes nothing — the guards closed over it at construction. Pass the override into the factory.

### Notifications — `mailer` and `mailThrottle`

Every guard used to construct its own `SocketLabsLib` inline. Two consequences, both fixed here:

- **No branch was integration-testable.** With real credentials in `.env` the only paths reachable without mailing a real person were "address not found" and the bad-DB guard — the success path included, since `enableEmailAccess` sent the welcome mail itself. `mailer` takes any object with the six [`IVerifyEmailMailer`](#iverifyemailmailer) methods, so a suite can assert *which* notification a branch sends.
- **Three guards had no counter.** `handleIfEmailAlreadyValid`, `handleIfAccountDeleted` and `handleIfAccountDisabled` mailed on every request, and all three are reachable from an unauthenticated `GET /check/verify-email/:email/:hash`. Anyone who knew a registered address could make the platform's own SocketLabs account mail its owner once per request. `mailThrottle` now debounces all five guard notifications by default.

The default is `throttleMailer(socketLabsVerifyEmailMailer, createMailThrottle())` — a fresh 15-minute, per-address, per-template window **per flow**, so two flows never share one. `mailThrottle` replaces just the window; `mailer` replaces the whole sender and makes `mailThrottle` inert, so wrap it yourself if you want both:

```ts
import { createMailThrottle, ALWAYS_MAIL } from '@axiumine/koa-utils/lib/access/createMailThrottle'
import { throttleMailer } from '@axiumine/koa-utils/lib/access/verifyEmailMailer'

createVerifyEmailFlow({ model: Account, mailThrottle: createMailThrottle({ windowMs: 60 * 60 * 1000 }) })
createVerifyEmailFlow({ model: Account, mailThrottle: ALWAYS_MAIL })              // opt out entirely
createVerifyEmailFlow({ model: Account, mailer: throttleMailer(myMailer, redisThrottle) })
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

## `verifyEmailMailer`

**Import:** `import { IVerifyEmailMailer, socketLabsVerifyEmailMailer, throttleMailer, defaultVerifyEmailMailer } from '@axiumine/koa-utils/lib/access/verifyEmailMailer'`

### `IVerifyEmailMailer`

```ts
export interface IVerifyEmailMailer {
	emailAlreadyValid(email: string): Promise<unknown>
	wrongHash(email: string, times: number): Promise<unknown>
	tooMuchVerifyRequests(email: string): Promise<unknown>
	hashReqTooOld(email: string): Promise<unknown>
	accountDisabled(email: string): Promise<unknown>
	sendWelcome(email: string): Promise<unknown>
}
```

Structural, not nominal — any object carrying these six methods satisfies it, `SocketLabsLib` included, so an existing client can be passed straight through. `wrongHash`'s `times` is the strike this attempt makes (`requestTimes + 1`), not the stored count.

`accountDisabled` covers **both** the disabled and the deleted account: there is no `accountDeleted` template in `SocketLabsLib`, and `handleIfAccountDeleted` has always sent this one. Left as shipped rather than quietly changed — the copy is a product decision.

**Signatures:**
```ts
export const socketLabsVerifyEmailMailer: IVerifyEmailMailer
export const throttleMailer: (mailer: IVerifyEmailMailer, throttle: TMailThrottle) => IVerifyEmailMailer
export const defaultVerifyEmailMailer: IVerifyEmailMailer
```

- `socketLabsVerifyEmailMailer` — SocketLabs, `new SocketLabsLib()` per call exactly as the guards did inline. Per call rather than once at module load because the constructor reads `process.env` (server id, API key, platform name, domain, sender); hoisting it to import time would pin whatever the environment held when the module was first resolved.
- `throttleMailer(mailer, throttle)` — asks `throttle` before each of the five guard notifications, keyed `` `${method}:${email}` ``. A dropped send resolves `undefined` and is invisible to the caller. `sendWelcome` passes straight through: it fires once, on the success path, and no unauthenticated caller can trigger it twice anyway — the second request meets `handleIfEmailAlreadyValid`.
- `defaultVerifyEmailMailer` — what the `UserBase`-bound guard exports mail through: SocketLabs on the default window, one throttle for the whole process, because those bindings are one shared chain (the `routerVerifyEmail` export existing consumers import). `createVerifyEmailFlow` does **not** use this value; it builds its own mailer and throttle per flow.

## `createMailThrottle`

**Import:** `import { createMailThrottle, ALWAYS_MAIL } from '@axiumine/koa-utils/lib/access/createMailThrottle'`

**Signature:**
```ts
export type TMailThrottle = (key: string) => boolean | Promise<boolean>

export interface ICreateMailThrottleArgs {
	windowMs?: number   // default 15 * 60 * 1000
	maxKeys?: number    // default 5000
}

export const createMailThrottle: (args?: ICreateMailThrottleArgs) => TMailThrottle
export const ALWAYS_MAIL: TMailThrottle
```

In-process debounce: `true` for the first key in a window, `false` for every repeat until it lapses. In-process on purpose — no runtime dependency, nothing to configure, and the amplification it has to stop arrives through one process. Behind several instances it degrades to one mail per instance per window, which is a cap rather than the unbounded fan-out it replaces.

`maxKeys` bounds the map so an attacker cycling addresses cannot grow it without limit. At the cap, expired keys are swept first; if every tracked key is still inside its window the oldest is evicted. Evicting rather than refusing is deliberate: refusing to send would let a flood of fresh addresses mute the notifications of real ones.

The contract is a single function so a deployment can replace it. One mail per address across a fleet is a Redis `SET key NX PX <window>` away:

```ts
const redisThrottle: TMailThrottle = async (key) =>
	(await redis.set(`${process.env.REDIS_KEY}mail:${key}`, '1', 'PX', 15 * 60 * 1000, 'NX')) === 'OK'
```

`ALWAYS_MAIL` restores the send-every-time behaviour of 5.6.1 and earlier.

## `accessPaths`

**Import:** `import { DEFAULT_RESET_PWD_PATHS, resolveResetPwdPaths } from '@axiumine/koa-utils/lib/access/accessPaths'`

**Signature:**
```ts
export type TAccessModel = Model<any>
export type TOnAbandon = 'delete' | 'soft-delete' | 'keep'

export const DEFAULT_RESET_PWD_PATHS: IResetPwdPaths          // frozen
export const DEFAULT_VERIFY_EMAIL_PATHS: IVerifyEmailPaths    // frozen

export function resolveResetPwdPaths(paths?: Partial<IResetPwdPaths>): IResetPwdPaths
export function resolveVerifyEmailPaths(paths?: Partial<IVerifyEmailPaths>): IVerifyEmailPaths
```

Both default maps are `Object.freeze`d, lists included, so one consumer cannot mutate the defaults of another. The `resolve*` helpers merge a partial override over the defaults with a plain spread and return a fresh object — a key present with an explicit `undefined` value overrides the default *with* `undefined`, so pass only the keys being changed.

`TOnAbandon` lives here rather than next to the factory that consumes it: the private `abandonUser` writer needs the type, and importing it from `createVerifyEmailFlow` — which imports `abandonUser` — would be circular.

`TAccessModel` is deliberately `Model<any>`: the flows only ever call `findOne`, `updateOne`, `countDocuments` and `deleteOne` with computed field paths, so nothing can be typed against a concrete document shape without forcing every consumer to describe theirs. The path map is what pins the contract instead — a wrong path is a runtime no-op, which is why the defaults are exported and the flows are tested against them.

## Notes for maintainers

- The `UserBase`-bound exports are built by applying these same factories at module load. There is no second code path: `resetPwd` *is* `createResetPwdMutation({ getResetPwd, saveResetReq })` over `UserBase`, and so on down the chain. A behaviour change made in one is made in both.
- The projection strings the flows build (`buildProjection`) are byte-identical to the hand-written ones they replaced when the default paths are used. Every field a resolver reads must appear in the map that builds the projection — a `.lean()` read of a field left out is simply absent, with no error, which is how a missing `account.email.requestTimes` turned every wrong-hash attempt into a 500 through 5.1.0.
- Dotted paths are read out of the lean documents with `readPath` (`src/private/lib/access/pathTools.mts`), which answers `undefined` for any missing or non-object link rather than throwing, so the callers' `typeof x === 'undefined'` guards keep working unchanged.
- The mail debounce is **on by default**, and `defaultVerifyEmailMailer`'s window is process-wide. A spec that drives a guard twice against the same address, or two specs that reach the same template with the same address, sees the second send suppressed — which shows up as a bare `expected false to equal true`, order-dependent and confusing. Build the guard from its `create*` factory with an injected fake (`test/helpers/fakeVerifyEmailMailer.mts`) instead of stubbing `SocketLabsLib.prototype`, and give the one test that does exercise the bound default its own unique address.
