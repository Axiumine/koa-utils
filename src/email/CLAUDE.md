# src/email — agent rules

Repo-wide rules in root `CLAUDE.md`. Editing this file → Rule 0 there first (caveman ultra via `caveman:caveman` skill; skill missing = blocked).

## Rules

- **`SocketLabsLib` spec asserting only returned boolean pin nothing about the email.** 4 bugs shipped that way, all under green 100% gate: dead activation URL, stray `}` in subject, leaked `" +` concat syntax in body, hard-coded recipient. Touch any copy → read message back via `sentMessage()` helper in `test/email/SocketLabsLib.spec.mts`, assert `subject` + `textBody` + `htmlBody`.
- Callers mail via injected `IVerifyEmailMailer` (`src/lib/access/verifyEmailMailer.mts`), never `new SocketLabsLib()` inline in a guard. Bound default sit behind **process-wide** 15 min per-address-per-template debounce → `src/lib/access/CLAUDE.md`, `test/CLAUDE.md`.

## Docs, same commit

`src/email/**` → `docs/code/email.md`.
