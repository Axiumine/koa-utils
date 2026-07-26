# src/private — agent rules

Repo-wide rules in root `CLAUDE.md`. Editing this file → Rule 0 there first (caveman ultra via `caveman:caveman` skill; skill missing = blocked).

## Rules

- Internal modules. Never import from outside package. Never add `private/*` to `package.json` `exports`.
- **Covered + measured like everything else.** `src/private/**` was excluded from `.c8rc.json` until the coverage gate landed → hid auth / email-verification chain → inverted `if` in `handleIfAccountDisabled` could land with suite still reporting 100%. Never re-exclude.
- Every db helper + guard under `src/private/lib/access/**` = `createXxx(model, paths)` + `UserBase`-bound default of same name. The 3 mutations and `routerVerifyEmail` take collaborators as deps. Never re-hardcode `UserBase` or literal field path → bind through `src/lib/access/create*Flow.mts`.
- Guards mail via injected `IVerifyEmailMailer`, never `new SocketLabsLib()` inline. Disposal policy come from factory's single writer → never branch on `onAbandon` inside a guard. → `src/lib/access/CLAUDE.md`.

## Security — full prose, do not compress

- **`handleBadDB` must throw `EMAIL_CHECK_LINK`, exactly like every sibling guard.** It carried `/x/error` through 5.6.1, and that is an account-existence oracle: on an unauthenticated route, two distinct redirect targets let a caller tell a corrupt record on a real account apart from an unknown address. The only place that distinction is allowed to live is `Sentry.captureMessage('[handleBadDB] DB ERROR')`. Do not reintroduce a per-guard redirect path, and do not add a new redirect target to any guard on this route.
- **`.lean()` readers bypass Mongoose casting** (`userData4VerifyEmail`, `emailChangeHashVerify`), so a legacy stored string `'false'` reads as truthy. The code reads these flags raw on purpose — do not add runtime coercion at the call sites. Fixing the data is the owner's decision and the tool is `scripts/migrate-account-disabled-to-boolean.mjs`. Background: root `CLAUDE.md` → "Security invariants".

## Docs, same commit

`src/private/**` → `docs/code/internal.md`.
