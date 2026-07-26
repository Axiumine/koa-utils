# test — agent rules

Repo-wide rules in root `CLAUDE.md`. Editing this file → Rule 0 there first (caveman ultra via `caveman:caveman` skill; skill missing = blocked).

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
