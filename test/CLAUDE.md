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

## Property specs — `test/property/*.spec.ts`

- Ext `.ts` not `.mts`: Scorecard Fuzzing scan `*.ts` / `*.tsx` for `fast-check` import, `.mts` → score 0. Only `.ts` dir under `test/`.
- `tsconfig.build-tests.json` + `tsconfig.test.json` include `test/**/*.ts`. `build:tests` rename emitted `.js` → `.mjs` → mocha glob pick it.
- Cross-file by design → no `src/` mirror. Pure guards only: no DB, no net, no sinon. Import stay 1 line (`import fc from 'fast-check'`) → Scorecard regex per line.
- Comments caveman ultra, same as `.mts`. `scripts/caveman-gate.sh` match `.mts` only → convention here, not machine-enforced. Extend gate = owner call.
- Fail → fast-check print `seed` + `path`. Replay: `fc.assert(prop, { seed, path })`. Counterexample = real `src/` bug or wrong property. Never narrow generator to go green.
- Deeper local fuzz: `FC_NUM_RUNS=100000 yarn test`. Default 500 runs/property.
- No coverage role: `src/` already 100%. Property spec never replace branch-cover spec in `test/<area>/`.

## Snapshots — `test/__snapshots__/*.json`

- 2 committed JSON, zero-dep (`node:assert` + `test/helpers/snapshot.mts`, no snapshot lib):
  - `public-api.json` ← `test/package/publicApi.spec.mts`. `exports` key → sorted runtime symbol names, dist modules dynamic-imported.
  - `graphql-errors.json` ← `test/graphQL/throw/errorCatalog.spec.mts`. Each `throwXxx` → `{ message, extensions }`. Same spec check `docs/code/graphql-errors.md` quote status, title, description (substring, no table parse).
- Read from repo root via `process.cwd()` → run via `yarn test` / `yarn test:coverage`, not from other cwd.
- Regen: `UPDATE_SNAPSHOT=1 yarn test`. Only on intentional change.
- Snapshot diff in PR = API change. Review like code: removed key/symbol = breaking (major), added = additive (minor), changed error title/status/description = observable behaviour → update `docs/code/graphql-errors.md` same commit.
- Never regen to go green without reading diff. Red snapshot = real API drift until proven otherwise.
- `publicApi.spec.mts` allowlist (`validateMimeTypePdf`, `checkForNSFW`) = dist files deliberately unexported. Owner decide public or not. New unexported dist file → spec fail → add `exports` key, never grow allowlist unasked.
- Writer fn `checkSnapshot` tested both branches in `test/helpers/snapshot.spec.mts`.

## Traps that give green gate over real bug

- **Sealed ESM namespaces.** `sinon.stub()` on `@sentry/node` or `sharp` fail: "ES Modules cannot be stubbed". Assert observable effect instead — Sentry never init'd in suite → `captureException` safe no-op — or drive real lib against fixture.
- **Projected reads.** Stub of `findOne` discarding `.select()` arg hide projection bug; `.lean()` make it silent — field outside projection simply absent, no error. Stub decide doc shape → doc never disagree with projection. Spec stub a projected read → capture projection string, assert it cover every field resolver read. Ref: `selectedFields` in `test/graphQL/schema/mutations/emailChangeHashVerify.spec.mts` + `test/private/lib/access/db/getResetPwd.spec.mts`. Cost 5.1.0 a 500 on every hash mismatch.
- **Verify-email mailer debounce.** Build guard from its `create*` with `fakeVerifyEmailMailer()` (`test/helpers/fakeVerifyEmailMailer.mts`). Stubbing `SocketLabsLib.prototype` + driving same address twice — or 2 spec files reaching same template with same address — get 2nd send suppressed by **process-wide** 15 min per-address-per-template debounce → surface as bare `expected false to equal true`, order-dependent. Any test exercising bound default get its own unique address.
- **Email copy.** Boolean-only assert on `SocketLabsLib` pin nothing. Read message back via `sentMessage()` in `test/email/SocketLabsLib.spec.mts` → assert `subject`, `textBody`, `htmlBody`.
