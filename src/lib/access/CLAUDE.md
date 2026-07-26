# src/lib/access — agent rules

Repo-wide rules in root `CLAUDE.md`. Editing this file → Rule 0 there first (caveman ultra via `caveman:caveman` skill; skill missing = blocked).

Public entry for model-agnostic access flows (5.3.0+): `createResetPwdFlow`, `createVerifyEmailFlow`, `accessPaths`. Impl in `src/private/lib/access/**` → `src/private/CLAUDE.md`.

## Rules

- Everything downstream = `createXxx(model, paths)` + `UserBase`-bound default of same name. Bind model + field paths **here**. Never re-hardcode `UserBase` or a literal field path inside helper, guard, mutation, router.
- `resetClear`, `verifyClear`, `emailChangeClear` = **caller-supplied `$unset` lists**, not derived from leaf paths flow read. Layout storing request as 1 required-members subdoc under `validationLevel: 'strict'` reject write unsetting single member → only legal cleanup = container path. Deriving look right on flat layout → make strict layout impossible.
- `createVerifyEmailFlow` `onAbandon` (`'delete'` default / `'soft-delete'` / `'keep'`) + `deleteUserByEmail` set the disposal writer both guards run. Factory build **exactly 1** writer, use it in guards **and** return it → `flow.deleteUserByEmail` report policy, reassigning after the fact do nothing. `deletedValue` default `true`, written verbatim; fn called once per write (`Date` column). Guards throw whatever policy is → never branch on policy inside a guard.
- Verify-email guards mail via injected `IVerifyEmailMailer` (`verifyEmailMailer.mts`), never `new SocketLabsLib()` inline. Bound default = `defaultVerifyEmailMailer` = SocketLabs behind **process-wide** 15 min per-address-per-template debounce (`createMailThrottle.mts`, `ALWAYS_MAIL` opt-out), on by default. Test fallout → `test/CLAUDE.md`.
- Field invariants these flows read (`account.email.hash` vs `account.resetHash`; `disabled`/`deleted` = `Boolean`) → root `CLAUDE.md` "Security invariants". Read before touching either.

## Docs, same commit

`src/lib/access/**` → `docs/code/lib-access.md`. Rest of `src/lib/`: `*.mts` → `lib-core.md`, `db/**` → `lib-db.md`, `MariaDB|MongoDB|PostgreSQL/**` → `lib-datasource-errors.md`, `Redis/**` + remaining utils → `lib-utilities.md`.
