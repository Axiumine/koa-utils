# test — agent rules

Repo-wide rules in root `CLAUDE.md`. Editing this file → Rule 0 there first (caveman ultra via `caveman:caveman` skill; skill missing = blocked).

## Comment style — caveman ultra, machine-enforced

Every comment in `test/**/*.mts` written caveman ultra. Same spec as `CLAUDE.md`, same skill.

1. **Invoke skill first:** `Skill(skill: "caveman:caveman", args: "ultra")`. Read level table + Auto-Clarity out of skill. Never write ultra from memory — spec drift.
2. Skill missing or invocation fail → **STOP**, do not write, warn dev, quote install commands from root `CLAUDE.md` Rule 0 §2. Nothing written.
3. **Ultra = abbrev prose words** (DB, auth, config, req, res, fn, impl), strip conjunctions, `X → Y` for causality, 1 word where 1 word carry it. **Never abbrev or reword code symbols, fn names, API names, error strings, env vars, paths, command lines** — quoted verbatim or wrong.
4. **Auto-Clarity override, not optional.** Full sentences for: why a regression guard exist, security invariant a spec pin, ordered setup where dropped conjunction flip meaning. Compressed-to-ambiguous comment = defect, not style win.
5. **`describe` / `it` description strings are not comments.** Runner print them, consumer read them in CI output → normal prose, never rewritten.
6. **Directive comments are code, not prose.** `eslint-disable*`, `@ts-expect-error`, `@ts-ignore`, `c8 ignore`, `prettier-ignore`, `istanbul ignore` → verbatim, tool parse them.
7. Machine-enforced, step 1 not optional: `PreToolUse` hooks in `.claude/settings.json` run `scripts/caveman-gate.sh`, deny any `Write`/`Edit` to `test/**/*.mts` when skill not installed or not invoked this session. Fail closed. Escape hatch `SKIP_CAVEMAN_GATE=1`, owner only. Blocked write → invoke skill, never delete gate.

## Setup

- Mocha + sinon + chai + `mongodb-memory-server`. No swap.
- Layout mirror `src/`: `src/<area>/<Name>.mts` → `test/<area>/<Name>.spec.mts`.
- `yarn test` = build + run, no coverage check. `yarn test:coverage` = the gate, and the only command deciding a change finished.
- 100% statements / branches / functions / lines, **per file**. Red gate → write test. Never lower threshold, never `.c8rc.json` exclude, never `/* c8 ignore */`.
- Cover every branch, incl unreachable-feeling: each `if`/`else`, every `??` / `?.` / `||` fallback, every `catch`, every early return. 1 uncovered ternary arm in 1 file fail whole run.

## Traps that give green gate over real bug

- **Sealed ESM namespaces.** `sinon.stub()` on `@sentry/node` or `sharp` fail: "ES Modules cannot be stubbed". Assert observable effect instead — Sentry never init'd in suite → `captureException` safe no-op — or drive real lib against fixture.
- **Projected reads.** Stub of `findOne` discarding `.select()` arg hide projection bug; `.lean()` make it silent — field outside projection simply absent, no error. Stub decide doc shape → doc never disagree with projection. Spec stub a projected read → capture projection string, assert it cover every field resolver read. Ref: `selectedFields` in `test/graphQL/schema/mutations/emailChangeHashVerify.spec.mts` + `test/private/lib/access/db/getResetPwd.spec.mts`. Cost 5.1.0 a 500 on every hash mismatch.
- **Verify-email mailer debounce.** Build guard from its `create*` with `fakeVerifyEmailMailer()` (`test/helpers/fakeVerifyEmailMailer.mts`). Stubbing `SocketLabsLib.prototype` + driving same address twice — or 2 spec files reaching same template with same address — get 2nd send suppressed by **process-wide** 15 min per-address-per-template debounce → surface as bare `expected false to equal true`, order-dependent. Any test exercising bound default get its own unique address.
- **Email copy.** Boolean-only assert on `SocketLabsLib` pin nothing. Read message back via `sentMessage()` in `test/email/SocketLabsLib.spec.mts` → assert `subject`, `textBody`, `htmlBody`.
