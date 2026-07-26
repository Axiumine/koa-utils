# src/graphQL — agent rules

Repo-wide rules in root `CLAUDE.md`. Editing this file → Rule 0 there first (caveman ultra via `caveman:caveman` skill; skill missing = blocked).

## Shapes

- **New error** → wrap `throwGraphQLError(status, title, desc)` in new `src/graphQL/throw/throwXxxError.mts`. Never raw `GraphQLError` from business code.
- **New mutation** → export obj with `description`, `type`, `args`, `resolve`. DB work in `mongoose.startSession()` + `session.withTransaction(...)`, `endSession()` in `finally`. Catch with `tryCatchRethrow(e as GraphQLError | Error)`.
- **Mongo errors in mutation: no branching.** `tryCatchRethrow` → `throwIfMongoErr` map `DuplicateKeyError` → 409, `[Validator]`-prefixed msg → 400.
- Resolver take email/pwd → `email.toLowerCase().trim()`, then `checkEmailLen(uEmail)` / `checkPwdLen(password)`. First thing.

## Pitfalls

- `customFormatErrorFn` **re-throw** GraphQL errors, not return them. By design → Koa error middleware catch them.
- `emailChangeHashVerify` return `false` on branches arguably needing throw, marked `@fixme` ("email not found", missing `dateLastReq` guard). Never fix silently → coordinate with owner.
- `signUp` send "already valid" mail **and** throw 409 for existing user. Privacy/timing trade-off → keep both sides.
- **Projection trap.** Stub of `findOne` discarding `.select()` arg hide projection bug; `.lean()` make it silent — field outside projection simply absent, no error. `emailChangeHashVerify` omitted `account.email.requestTimes` through 5.1.0 → hash-mismatch path threw 500 every time → strike counter never advanced, owner never warned, 500-vs-`false` told caller an email change pending. Green 100% gate whole time: stub decide doc shape → doc never disagree with projection. Stub a projected read → capture projection string, assert it cover every field resolver read. Ref: `selectedFields` in `test/graphQL/schema/mutations/emailChangeHashVerify.spec.mts`.
- Access-flow mutations (`resetPwd`, `updatePassword`, `emailChangeHashVerify`) take collaborators as deps, bound in `src/lib/access/create*Flow.mts`. Never re-hardcode `UserBase` or literal field path. → `src/lib/access/CLAUDE.md`.
- Field invariants (`account.email.hash` vs `account.resetHash`; `disabled`/`deleted` = `Boolean`) → root `CLAUDE.md` "Security invariants". Read before touching either.

## Docs, same commit

|Changed|Update|
|---|---|
|`models/**`|`docs/code/graphql-models.md`|
|`schema/context/**`, `schema/interfaces/**`|`docs/code/graphql-context.md`|
|`schema/mutations/**`, `schema/GraphQLInput/**`|`docs/code/graphql-mutations.md`|
|`schema/types/**`|`docs/code/graphql-types.md`|
|`throw/**`, `status.mts`|`docs/code/graphql-errors.md` — quote status, `title`, `description` verbatim|
