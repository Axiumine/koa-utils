# src/email — agent rules

Repo-wide rules in root `CLAUDE.md`. Editing this file → Rule 0 there first (caveman ultra via `caveman:caveman` skill; skill missing = blocked).

## Rules

- **`SocketLabsLib` spec asserting only returned boolean pin nothing about the email.** 4 bugs shipped that way, all under green 100% gate: dead activation URL, stray `}` in subject, leaked `" +` concat syntax in body, hard-coded recipient. Touch any copy → read message back via `sentMessage()` helper in `test/email/SocketLabsLib.spec.mts`, assert `subject` + `textBody` + `htmlBody`.
- **Every value placed in an HTML body must go through `escapeHtml` (`src/private/email/escapeHtml.mts`), and every URL through `htmlLink` (`src/private/email/messageParts.mts`).** Names, error text, ids, codes and the subject in `<title>` reach the HTML part unescaped otherwise, and that was a shipped defect (it was limit L11 in `docs/security.md`): a name like `<script>` became live markup in the mail. The text part and the subject line stay raw, since they are not HTML. A new builder or a new interpolated value needs a hostile-value spec in the `HTML escaping of untrusted values` block of `test/email/SocketLabsLib.spec.mts`. Copy lives in `src/private/email/*Messages.mts`; the class stays a thin dispatcher.
- Callers mail via injected `IVerifyEmailMailer` (`src/lib/access/verifyEmailMailer.mts`), never `new SocketLabsLib()` inline in a guard. Bound default sit behind **process-wide** 15 min per-address-per-template debounce → `src/lib/access/CLAUDE.md`, `test/CLAUDE.md`.

## Docs, same commit

`src/email/**` → `docs/code/email.md`.
