# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Security

- `emailChangeHashVerify` now projects `account.email.requestTimes`. It was missing from the `.select(...)`, and since
  the query is `.lean()`, a field left out of the projection is simply absent on the returned object — so the
  hash-mismatch path always hit `typeof requestTimes === 'undefined'` and threw `500`. Three consequences, all fixed by
  adding the field:
  - `incReqTimes` was never reached, so the strike counter that `handleIfTooMuchRequestsTimes` uses never advanced. An
    attacker could guess the change-email hash without ever accumulating a strike.
  - `SocketLabsLib.wrongHash` was never sent, so the account owner was never warned that someone was guessing.
  - A wrong hash answered `500` while an unknown address answered `false`, which told an unauthenticated caller that a
    given address had an email change pending.

  The `typeof requestTimes === 'undefined'` guard stays, and is now what it was always meant to be: a defensive branch
  for a stored record that has a hash but no counter.

### Fixed

- `removeResetReq` no longer passes `{ upsert: true }`. Clearing the reset state of an email that matches no document
  did not no-op — MongoDB inserted a row keyed by `login.email`, and because `updateOne` runs no validators that row
  satisfied none of the schema's required fields (`login.password`, `account.email.valid`, `account.registrationDate`),
  leaving a junk user document behind. No caller could reach it today (`updatePassword` only calls it once the reset
  record has been read back), so nothing observable changes; the option was a trap waiting for the next caller. The
  spec now asserts `updateOne` is called with exactly two arguments, so any option object reintroduced later fails
  there.
- `test/graphQL/schema/mutations/emailChangeHashVerify.spec.mts` records the projection handed to `.select(...)` and
  asserts it covers every field the resolver reads. The bug above survived a green 100% gate because the `findOne` stub
  discarded the projection argument and returned a hand-built document that always carried `requestTimes` — the stub
  decided the document's shape, so the document could never disagree with the projection.

## 5.1.0 — 2026-07-22

Security release, and the first one that needs a data migration. Two defects, both in how account state is stored:
the password-reset token shared a field with the email-verification hash, and `account.disabled` was declared as a
string while every consumer treated it as a boolean. Neither is an API change — `IUserBaseSchema.account` only gains
an optional `resetHash` — but **run `scripts/migrate-account-disabled-to-boolean.mjs` before deploying** if the
database was ever written by 5.0.3 or earlier. See "Migration required" below.

### Security

- The password-reset token now lives in its own schema field, `account.resetHash`. It previously shared
  `account.email.hash` with signup activation and email-change, two flows with a different lifetime (3 days vs 60
  minutes), a different throttle (`account.email.requestTimes` vs a 10-minute window) and a different trust domain —
  proving control of an inbox versus authorising a password change. Two consequences, both closed by the split:
  - A hash minted by either flow was accepted by the other. An activation link already sitting in the user's inbox
    could set a new password, and a reset link could validate an email address.
  - `resetPwd` is unauthenticated, so one call for any known address overwrote a pending activation or email-change
    hash and silently broke the link already sent. Every click on the dead link incremented
    `account.email.requestTimes`, and at 5 `handleIfTooMuchRequestsTimes` deletes the account.

  `saveResetReq` writes `account.resetHash`, `removeResetReq` unsets it, and `getResetPwd` projects and reads it. There
  is deliberately no fallback to `account.email.hash` — reading the verification slot is the defect itself.

- `account.disabled` is now `type: Boolean` in `UserBaseSchema` and `UserAdminKoaUtilsSchema`, matching the
  `boolean` both TypeScript interfaces always declared. It was `type: String`, which did not merely mistype the field —
  it inverted it. Mongoose casts on write and on hydrated reads, so a stored boolean `false` came back as the string
  `'false'`, which is truthy, and every consumer tests the flag with a bare `if (account.disabled)`. `infoUserForLogin`
  and `infoUserAdminForLogin` read with `.exec()`, so `_finalizeLoginCheck` refused login with `403` and sent an
  "account disabled" email to a user explicitly marked **not** disabled. Writing `false` back through Mongoose stored
  the string too, so the flag could not be cleared through the models at all — only an absent field behaved. The
  library never writes `disabled` itself, which is why this stayed latent: operators only ever wrote `true`.

### Changed

- **Breaking for in-flight resets.** Reset links issued before the upgrade point at a hash stored in
  `account.email.hash`, which the new `getResetPwd` does not read; they fail with a 500 and the user must request a new
  one. The window is bounded by the 60-minute reset expiry, so it closes an hour after deploy. Rows carrying a stale
  `account.email.hash` from a reset need no migration: the verification flows overwrite that field on their next
  request.
- `IUserBaseSchema.account` gains `resetHash?: string`. Additive — consumers constructing the object literally are
  unaffected.

### Migration required

Applies to anyone upgrading from **5.0.3 or earlier** — every version up to and including `v5.0.3` declared
`account.disabled` as `{ type: String }`, so any database those versions wrote can hold `'true'`/`'false'` strings in
that field. A database only ever written by a fixed version needs nothing; running the script anyway is safe and
idempotent, since it only touches fields whose stored `$type` is `string`.

- **`scripts/migrate-account-disabled-to-boolean.mjs` — run once per database before deploying.** The schema change
  above repairs hydrated reads, not stored data, and `.lean()` readers (`userData4VerifyEmail`,
  `emailChangeHashVerify`) bypass Mongoose casting entirely: on un-migrated rows they still see `'false'` and still
  block the account. The code reads these flags raw and deliberately does not coerce, so the migration is the fix.

  ```
  MONGO_URI='mongodb://user:pass@host:27017/dbname' node scripts/migrate-account-disabled-to-boolean.mjs
  MONGO_URI='...' node scripts/migrate-account-disabled-to-boolean.mjs --apply
  ```

  Dry run by default — it reports what it would change and writes nothing. `--apply` performs the update, `--db=<name>`
  supplies the database when the URI carries none, `--collections=user,userAdmin` narrows the targets (that pair is the
  default). `MONGO_URI` is mandatory; the script refuses to guess a connection string. It covers `account.disabled` and
  `account.deleted` in both collections, and requires no install — `mongodb` ships with the `mongoose` peer.

  Mapping: `'true'` → `true`, `'false'` → `false` (both case-insensitive, trimmed), `''` → field removed, already-boolean
  → untouched. **Any other string is left alone and reported by `_id`**, and the run exits with code `2` — a value
  nobody planned for is not something a migration should guess at. Resolve those rows by hand and re-run. Re-runs are
  idempotent. Take a backup first: this edits account access flags.

## 5.0.3 — 2026-07-22

Security release. Upgrade from 5.0.2 or earlier: every version up to and including 5.0.2 allows a password reset to be
completed without the reset hash, under a state an unauthenticated caller can help bring about. No API change.

### Security

- `getResetPwd` no longer coerces a missing reset hash into a string. It built its return value with
  `'' + account.email.hash`, so an absent hash became the literal nine-character string `"undefined"`. That value is not
  `null`, so it cleared `updatePassword`'s guard, and it then compared equal to a caller sending that same literal as
  the `hash` argument — completing a password reset with no secret at all, only the victim's email address and the
  60-minute window. The state is reachable rather than theoretical: `account.email.hash` is a slot shared with the
  email-verification and email-change flows, and `enableEmailAccess` / `confirmNewEmail` both clear it without touching
  `account.resetDateReq`. Since `resetPwd` is unauthenticated and plants `resetDateReq` for any known address, an
  attacker could open the window themselves and wait for the victim to complete a verification. `resetHash` is now
  populated only when the stored value is a string, and fails closed to `null` (a 500) otherwise.

### Fixed

- `yarn upload` now runs `npm publish --registry=https://registry.npmjs.org/`. Yarn 1 exports the registry from `.yarnrc`
  to child processes as `npm_config_registry`, so the previous bare `npm publish` targeted the maintainer's local
  Verdaccio mirror rather than npmjs whenever it was invoked through yarn. On the maintainer machine that surfaced as
  `ENEEDAUTH` against `yarnproxy.gio.lan` and published nothing; on a machine authenticated to the mirror it would have
  published there silently, leaving npmjs without the release. npm ranks CLI flags above environment variables, so the
  explicit `--registry` wins. Repository tooling only — the published package is unaffected.

## 5.0.2 — 2026-07-22

Single source fix, no API change. `dist` output differs from 5.0.1, so consumers should upgrade — the bug below leaves a
live reset hash in the field the email-verification chain reads.

### Fixed

- `removeResetReq` now `$unset`s `account.email.hash` instead of `account.resetHash`. The latter exists in neither
  `UserBaseSchema` nor `saveResetReq` — which writes the reset hash to `account.email.hash` — so the `$unset` silently
  matched nothing and the hash outlived the reset it belonged to. The password-reset flow itself was unaffected, since
  `getResetPwd` only returns `resetHash` when `account.resetDateReq` is set and that field *was* cleared. The leak
  reached the email-verification chain instead: `userData4VerifyEmail` reads the same `account.email.hash`, so
  `handleIfHashBad` compared incoming verification links against a stale but live reset hash. The spec now pins the
  `$unset` paths against the `$set` paths of `saveResetReq`, so the two can no longer drift apart.

## 5.0.1 — 2026-07-21

Repository tooling only. No source change, so the published package is identical to 5.0.0 — `files: ["dist"]` keeps every
file below out of the npm tarball.

### Added

- `yarn.lock` is pinned to `https://registry.npmjs.org/` by a git clean/smudge filter, so a plain clone installs with no
  extra setup. Maintainers installing through a private npm mirror previously committed that host into every `resolved`
  entry, because Yarn 1 records absolute tarball URLs — clones without access to the mirror could not `yarn install`.
  `clean` rewrites the mirror to the public registry on the way into the index, `smudge` reverses it on checkout. The
  filter *definition* lives in `.git/config`, so clones that never configure it simply get the public URLs. Because
  `clean` also runs for `git diff` and `git status`, the host difference never surfaces as a modification. Override the
  mirror per machine with `YARN_PROXY_REGISTRY`. Integrity hashes are unaffected — the mirror serves byte-identical
  upstream tarballs, only the URL differs. Published tarballs were never affected either way.
- `.githooks/pre-commit` gains a lockfile backstop for clones where the filter was never configured: it reads
  `:yarn.lock` from the index and rejects any `resolved` host other than `registry.npmjs.org`. It inspects the index
  unconditionally rather than gating on the staged diff, since a tainted blob matching `HEAD` produces no diff at all.
- `.githooks/commit-msg` enforces conventional commits: types `feat|fix|chore|docs|refactor|ci` only, subject capped at
  72 characters, body at 10 lines wrapped to 72. Merge and revert commits bypass the format check. The hook also rejects
  AI-attribution words, so no such trailer is appended in this repo.
- `mocha-skill` agent skill, vendored from `lambdatest/agent-skills` and pinned in `skills-lock.json`. Generates Mocha +
  Chai + sinon tests, matching the runner this repo already uses.

### Documentation

- `README.md` gains a "Registry" section describing the lockfile filter for anyone installing through a private mirror.
- `CLAUDE.md` records the enforced commit rules verbatim. The previous "subject ≤ ~50 chars" line was a soft convention
  with nothing checking it; 50 is now stated as the target and 72 as the hard limit.

## 5.0.0 — 2026-07-21

### Changed

- **BREAKING** — all consumer-visible strings are now English. GraphQL validation error messages, transactional email
  subjects and bodies, and the `emailChangeHashVerify` mutation description (surfaced through introspection) were Italian.
  Consumers matching on literal strings such as `"L'email non puo essere vuota"` or `"La password e troppo corta"` must
  switch to the English text, or better, to the HTTP status. End users receive email in English from this version on.
- **BREAKING** — `sendConfermaResetPwdHash` and `sendOTP` no longer carry hard-coded brand copy. Both were branded
  `Polis24`, then the neutral placeholder `YourCompany`; both now use the configured `platformName` (`PLATFORM_NAME`),
  like every other method on the class. Consumers who left `PLATFORM_NAME` unset will see `undefined` in those subjects
  and bodies where they previously saw a literal placeholder.
- **BREAKING** — Italian identifiers removed from the public API. `sendConfermaResetPwd` → `sendResetPwdConfirmation`,
  `sendConfermaResetPwdHash` → `sendResetPwdConfirmationHash`, `sendEmailPostSegnalato` → `sendEmailPostReported`
  (matching the name already used by the commented-out variant in the same file). The module-internal `IInfoUtente` is
  now `IUserInfo`, and the `idUtente` / `infoUtente` parameters are `userId` / `userInfo`.
- **BREAKING** — the `package.json` export key `./email/SocketlabsLib` is corrected to `./email/SocketLabsLib`, matching
  the source filename and the exported class. The old lower-case `l` spelling no longer resolves.
- **BREAKING** — `sendOTP` returns `Promise<boolean>` instead of `Promise<string | null>`, and
  `sendResetPwdConfirmationHash` returns `Promise<boolean>` instead of `Promise<boolean | null>`. See "Fixed" below —
  the old return types described values neither function could produce.

### Fixed

- `package.json` export subpaths `./graphQL/schema/status` and `./files/validateJpgPngMimeType` pointed at `dist` files no
  source ever emitted, so both threw `ERR_PACKAGE_PATH_NOT_EXPORTED`. Repointed at real build output.
- **The subscription-activation link was broken.** `sendSubscriptionEmail` built its URL as
  `` `${this.linkBase}'/x/emailVerify` `` — a stray apostrophe inside the template literal — so every recipient got a
  dead link to `https://host.example'/x/emailVerify`. The same method's subject carried a stray trailing `}`
  (`Activate your Foo account}`).
- **`sendEmailChangeVerify` shipped raw source syntax to recipients.** Its HTML body was a template literal still
  containing `" +` and a `'` left over from a string-concatenation rewrite, so the email rendered
  `…sign in with.<br><br>" + 'You can confirm the registration…`.
- `sendResetPwdConfirmationHash` built a `subject` local, used it for the HTML `<title>`, then passed a **different**
  literal to the send call — so the message header and the subject line disagreed. One subject is now used for both.
- `sendOTP` set `ret = null` on the success path *and* in the `catch`, so it always returned `null` and no caller could
  distinguish a sent OTP from a failed one. Both methods now return the `sendTemplate` boolean, or `false` when the
  client throws synchronously. This removes the `/* c8 ignore */` that documented the dead branch.
- The fallback HTML header declared `<html lang="it">` while all copy is English since 4.0.1.
- **BREAKING** — `sendEmailPostReported` sent every report notification to a hard-coded `dummy@example.com`. It now
  addresses `process.env.DEV_TEAM_EMAIL`, the recipient `alertDevTeam` already uses. Consumers relying on the old
  address received nothing useful; consumers with `DEV_TEAM_EMAIL` unset will send to the string `'undefined'`, the same
  failure mode `alertDevTeam` has always had.

### Added

- Four missing export keys for symbols that were already public: `./graphQL/status`, `./files/validatePdfExtension`,
  `./koa/IKoaError`, `./graphQL/schema/context/IContextKoaErrorHandler`. 139 → 143 keys, all verified to resolve.

### Documentation

- 52 verified doc/code mismatches fixed across a 23-target audit. `REPO.md` claimed the repo ships no tests;
  `lib-utilities.md` still described `randomString` / `getRandomArbitrary` as `Math.random()`-based, i.e. it documented
  the exact weakness the 4.0.0 CSPRNG rewrite removes; `internal.md` described the pre-refactor verify-email guard chain
  and claimed `setLastLoginSQL` interpolates into SQL; six places said `[Validator]` Mongo errors map to 422 (they map
  to 400).
- `CLAUDE.md` gains a "Documentation — keep in sync with code" section with an `src`-path → doc-file map.

### Tests

- Test tree now genuinely mirrors `src/`: ~20 modules had no spec of their own and were only exercised transitively.
  Adds dedicated specs for the private login helpers, the access/db writers, `encryptPassword` and the Redis boolean
  codecs; splits the flat `models.spec.mts` into per-model files. 99 → 118 spec files, 616 → 653 tests. Coverage stays
  100% on all four metrics, per file.
- The email specs asserted only return values, never message content — which is why the broken activation URL, the stray
  `}` and the leaked `" +` survived a 100%-covered suite. A `sentMessage()` helper now reads the `BasicMessage` handed to
  `client.send()`, and subject/textBody/htmlBody are asserted for every bug fixed above. 653 → 657 tests.

## 4.0.1 — 2026-07-20

### Security

- **Introspection bypass when `INTROSPECTION_CODE` is unset.** The three authenticated middlewares compared the
  client-supplied `x-introspectioncode` header against `` `${process.env.INTROSPECTION_CODE}` ``. That template literal
  coerces an unset variable to the string `'undefined'`, so a client sending `x-introspectioncode: undefined` satisfied
  the check with no secret at all. Worst case is `authenticatedResourceHandler`: reaching the comparison needs only a
  self-generated v4 uuid, so an unauthenticated caller could walk past the expired/deleted-token rejection and reach
  `next()` with `ctx.state.user` never set — consumers whose routes treat "the middleware did not throw" as authorization
  served those requests. All three now call `verifyIntrospectionCode`, which returns `false` when the variable is unset or
  empty and otherwise compares with `timingSafeEqual`, on byte lengths rather than character lengths.
  Consumers with `INTROSPECTION_CODE` set see no behaviour change. Consumers who left it unset lose an undocumented
  anonymous bypass.

### Changed

- Formatting drift in `verifyEmail.mts` (import order) and `assertVerifyEmailAllowed.mts` (signature on one line) brought
  back in line with `yarn lint`. No behaviour change.

## 4.0.0 — 2026-07-20

### Security

- **Password-reset and email-confirmation hashes are now generated with a CSPRNG.** `StringLib.randomString` used
  `Math.random()` — V8's xorshift128+, whose internal state is recoverable from a modest number of observed outputs. It
  is the generator behind the password-reset hash (`resetPwd`), the signup email-confirmation hash (`registerNewUser` via
  `emailHash`) and the email-change hash (`setEmailHash`). Attack: request a reset for an account you control, read your
  own hash, recover the generator state, predict the next issued hash, trigger a reset for the victim and use it. The
  50-character length gave no protection — entropy is bounded by the generator, not the output length.
  **Deployed consumers are issuing predictable reset tokens until they upgrade.**
  Now `crypto.randomBytes` over a 32-character alphabet (5 bits/char, 250 bits for a 50-char hash; `256 % 32 === 0`, so
  no modulo bias). The alphabet narrows from 36 to 32 symbols but stays a subset of `[0-9a-z]`; existing stored hashes are
  unaffected, they are only ever compared for equality.
- `StringLib.getRandomArbitrary` moved off `Math.random()` to `crypto.randomInt` — it backs `getRandomOTP`, and a
  predictable one-time password defeats the point of one.
- **Open-redirect guard strength is now pinned by tests, not by a pattern.** The semgrep sanitizer accepted any
  `if (re.test(x))` / `if (x.startsWith(p))` / `if (x === lit)` guard with the regex left unconstrained. Demonstrated, not
  theorised: replacing the guard in `koa/router/verifyEmail.mts` with `link.startsWith('/')` passed both the scan and the
  full suite while accepting `//evil.com`.
- **Path traversal in the move helpers.** `moveImageFile` and `moveFileStaticDomain` interpolated `folder` /
  `secondFolder` straight into the destination directory and `moveTempFile` joined `destFilename` onto it, so a `..`
  component escaped `UPLOAD_IMG_DIRECTORY_URL` / `STATIC_FOLDER`. `assertNoTraversal` rejects a literal `..` component
  while still allowing separators, so a legitimate `2026/07` keeps working (`path.basename()` would silently rewrite it
  to `07`). `sourceFilePath` and `destinationDir` are left unchecked on purpose — operating on the given path is those
  functions' contract.
- **Logout deleted the wrong Redis keys.** `logout` re-added the `refresh:` / `access:` prefix to tokens that already
  carried it, deleting `${REDIS_KEY}refresh:refresh:<uuid>` — a key never written. `del()` on a missing key returns 0 and
  the resolver swallows errors, so the refresh session silently survived logout. Keys now go through
  `buildPrefixedRedisKey`, which is idempotent, so consumers wiring `ctx.state.user` with a bare uuid keep working.
- The access-token suffix is now validated against the v4 uuid shape `generateAccessToken` produces — rejected with 499
  in `authenticatedResourceHandler`, ignored in `authenticatedLogoutHandler` where the access token stays optional.

### Changed

- **BREAKING** — `storeUploadAsTemp` now **rejects** on an oversize upload or a stream failure. It previously resolved in
  both cases, returning an `IStoreFile` whose `filePath` had just been deleted, so callers received a success and a dead
  path. `'close'` is now the single settle point; failure paths only record the cause and stop the stream. The real
  underlying error is propagated instead of a blanket `'File size exceeds the limit.'`, and the oversize message no longer
  interpolates `{maxFileSize}` without a `$` or calls bytes MB.
  Cleanup is now uniformly fire-and-forget, so the `Sentry.captureException` previously raised when the unlink itself
  failed is gone.
- **BREAKING (additive)** — `scanVirus` now returns `{ isInfected, viruses, alerted, scanned }` instead of `undefined`.
  Callers ignoring the result are unaffected. `scanned: false` means the scan did not complete — treat it as **unknown,
  not clean**. `scanVirus` still never throws on detection: blocking remains the caller's decision.
- `handleIfHashBad` takes a single options object instead of 5 positional parameters. It lives in `src/private/**` and has
  no `exports` entry, so the signature change cannot reach consumers.

### Added

- `lib/isSafeRedirectTarget` — the vetted redirect allowlist guard, extracted so its strength is pinned by tests rather
  than by a semgrep pattern that cannot evaluate what a regex admits. The spec asserts the concrete attack strings:
  protocol-relative, absolute http(s), backslash-prefixed, `javascript:`, lookalike prefixes, bare prefix, relative,
  empty, newline-smuggled, query/fragment delimiters.
- `isSessionBlocked` gains its `package.json` `exports` entry — it shipped in `dist` but consumers could not import it.
- `.github/workflows/semgrep.yml` — until now semgrep ran in no CI workflow at all. The canary job runs **first** and
  gates the scan: a rule that has been narrowed, typo'd or broken by an upgrade reports "0 findings" exactly like a clean
  codebase does. Image pinned to `1.169.0` in CI, `SEMGREP_IMAGE` overridable locally.
- `scripts/semgrep-canaries/` and `yarn semgrep:canary` — three buckets (must-fire, must-not-fire, known-gap). `known-gap`
  fixtures are asserted silent as a tripwire, so a documented blind spot is never recorded as intended behaviour and a
  coverage improvement fails the run until the list is updated.
- `koa-utils.nosql-injection.mass-assignment-update-doc` — the three existing NoSQL rules inspected only the filter
  argument, leaving the update document (`role`, `isAdmin`, `account.email.valid`) uncovered.
- Rule flagging non-exported helpers that hand a parameter to `fs` unsanitized — Semgrep OSS has no interprocedural taint
  and `--pro` refuses to run unlicensed, so the rule asks a question answerable inside one function. Flags a shape, not a
  proven flow: severity `WARNING`, confidence `LOW`.
- ESLint size/complexity budget (`max-lines`, `max-lines-per-function`, `max-params`, `max-depth`, `complexity`) for
  `src/**/*.mts` and `test/`, registered at `warn`.

### Fixed

- **The verify-email guard chain was untestable and hid six lethal defects.** `routerVerifyEmail`'s only entry point is a
  DB read that cannot be stubbed under the tsx loader, so the whole try-body was dead code under a `c8 ignore`. Each of
  these was verified green against the full suite beforehand: deleting the `handleIfAccountDisabled` call, negating the
  deleted flag (healthy accounts blocked, deleted ones let through), comparing the URL hash against **itself** (any hash
  validates any account), hard-coding `requestTimes` to 0 (lockout permanently disabled), dropping the `await` on the hash
  check, and moving `enableEmailAccess` ahead of the remaining guards. The chain now lives in
  `private/lib/access/assertVerifyEmailAllowed.mts`, which returns the id to enable and deliberately does **not** enable
  the account — the irreversible side effect cannot be reordered ahead of a guard by construction.
- `reEncodeToJpeg('x.jpeg')` and `reEncodeToPng('x.png')` always threw `Error('Error processing the image')`. sharp
  refuses to use one file as both input and output, and `reEncode` built `finalFilepath` by swapping the extension, so
  when the source already carried the target one the paths were identical. The source is now read into a Buffer first —
  a buffer input has no path to collide with.
- `reEncode` decides whether to delete the original by comparing **paths**, not extensions. With the buffer fix in place
  the old check would have deleted the file it had just written whenever `filePath` carried no extension. Side effect: a
  case-mismatched extension (`.JPEG` → `jpeg`) now removes the original instead of leaving a stale duplicate.
- Stale semgrep rule metadata: the SQL rule asserted a "confirmed live finding" at `setLastLoginSQL.mts:18` long after
  that line became a parameterized query; the redis rule cited the wrong line and omitted a second instance. Frozen canary
  counts are removed from the yml entirely — they live in the runner's output, which cannot go stale.
- Semgrep rule coverage: header sources matched by accessor shape instead of a two-name allowlist, `ctx.cookies.get()`
  added, open-redirect gains header/cookie sources, `fs` sinks extended to `copy`/`rename`/`appendFile`/`outputFile`/
  `rm`/`readdir` and namespaced `fs.createWriteStream` / `fs.createReadStream`, SQL source covers plain concatenation.
- NoSQL rules match a filter built in a local variable (`const f = {[k]: v}; findOne(f)`), not only an inline object
  literal at the call site.
- Path-traversal rule scoped to reachability instead of "any function parameter is a source", which was tautological for a
  filesystem utility library and produced 7 permanently-accepted findings.
- `cloc`/`scc` exclude lists named `.hg`, a Mercurial directory this repo never had, while `.git` was left to be walked.

### Tests

- **`src/private/**` is now covered and measured.** `.c8rc.json` excluded `dist/private/**`, hiding 37 files including
  the whole email-verification and account-access chain — inverting the check in `handleIfAccountDisabled` left the suite
  reporting a clean 100%. 19 new specs, exclusion dropped, 94.85% → 100%.
- Hard 100% coverage gate enforced locally, per file: `.c8rc.json` `check-coverage`/`per-file` with all four metrics at
  100, plus `.githooks/pre-commit` running `yarn test:coverage` on commits touching `src/`, `test/`, `package.json`,
  `.c8rc.json`, `.mocharc.json` or `tsconfig*.json`. Docs-only commits skip it. `yarn hooks:install` wires
  `core.hooksPath`, invoked from `prepare`.
- Mutation testing: 30 semantic mutations applied one at a time; 24 survived a green suite. Closed across several commits —
  refresh TTLs matched to their own key (swapping them gave the access token a 90-day lifetime), the rotated cookie
  **value** asserted (sinon matches on an argument prefix, so the value was never inspected), `ctx.state.user.id` read
  back in both authenticated middlewares (replacing it with a fresh ObjectId passed), `SALT_ROUNDS=14` asserted from the
  hash's cost factor, `endSession` asserted on the success path of six resolvers (moving it from `finally` to `catch`
  leaked a `ClientSession` on every successful call), the MIME allowlists driven with real-but-disallowed types instead of
  undetectable plaintext, the `|| ''` access-token fallback in logout exercised with the property absent, and the `await`
  on the old refresh-key deletion pinned (dropping it left the rotated-out key alive — session fixation).
- `extractBearerAccessToken`'s `Bearer access:` prefix check is pinned with a realistic token. The existing test named
  "ignores an authorization header that is not prefixed Bearer access:" used a fixture that is not a v4 uuid, so the uuid
  check rejected it either way — removing the prefix check kept all 579 tests green. A client sending
  `Bearer refresh:<valid uuid>` could read refresh entries through the access branch.

### Documentation

- All Italian comments in `src/` and `test/` translated to English, including text and identifiers inside commented-out
  code. Verified by parsing each file before and after with the TypeScript compiler and re-printing with `removeComments`:
  all 22 files produce byte-identical output. Commented-out `console.debug` lines are translated, not removed.

## 3.8.3 — 2026-07-19

### Security

- `authenticatedLogoutHandler` built the Redis key straight from the raw `Authorization` header. Unlike
  `authenticatedResourceHandler` it never checked the `Bearer access:` prefix, so a client controlled the whole key and
  could reach `refresh:` entries through the access branch. The access token is optional here, so a malformed one is now
  ignored rather than rejected — no new error path for existing clients.
- `setLastLoginSQL` interpolated `id` and the timestamp into the SQL string. Switched to sequelize `replacements`,
  matching `infoUserForLoginSQL`.

### Added

- Semgrep SAST for the Koa → Mongo/Redis/SQL injection surface (`.semgrep/koa-utils.yml`, 7 rules). Qodana ships no JS/TS
  taint analysis (JVM/PHP only) and gitnexus `--pdg` recognises no Koa taint sources, so that surface had no static
  coverage at all. Semgrep 1.169.0 cannot select `.mts` files, so `scripts/semgrep.sh` mirrors `src/**/*.mts` into a temp
  shadow tree as `**/*.ts` with byte-identical content (line numbers map 1:1) and rewrites the extension back in the
  output. Not wired into CI at this version.
- `pdg: true` pinned in `.gitnexusrc` so a plain `gitnexus analyze` keeps the PDG layer.

### Fixed

- `scripts/semgrep.sh` never passed `--error`. `semgrep scan` exits 0 even when reporting blocking ERROR-severity
  findings, so a clean scan and a scan full of criticals were indistinguishable to any caller.

## 3.8.2 — 2026-07-10

### Added

- `CheckModuleLicenses` enabled in Qodana. It ships `enabledByDefault=false`, so it needs an explicit include.
  `CheckThirdPartySoftwareList` is left off on purpose: it reports High until a generated licenses list is committed,
  which would trip `failureConditions.severityThresholds.high: 0`. `raiseLicenseProblems` is unset, keeping license
  findings report-only.

### Documentation

- `docs/code/` reference pages added.

## 3.8.1 — 2026-07-10

### Changed

- `throwMongoDBErrors` return type is now `never` — it always throws.
- `qodana.yaml` gains `failureConditions.severityThresholds` with `critical: 0` and `high: 0`.

## 3.8.0 — 2026-07-10

### Fixed

- `RedisDisconnect` calls `redisClient.close()` instead of the removed `quit()`.
- `tsconfig.build-tests.json` repaired so the test build runs again.

