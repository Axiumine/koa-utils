# CLAUDE.md — koa-utils

Repo-wide rules. Area rules in nested `CLAUDE.md`, load on demand when agent touch dir: `src/graphQL/`, `src/koa/`, `src/lib/access/`, `src/private/`, `src/email/`, `src/files/`, `test/`. File map: `REPO.md`.

## Rule 0 — every CLAUDE.md written in caveman ultra (MANDATORY, check before writing)

This rule is written in plain prose on purpose: it is a blocking multi-step sequence, and the caveman skill's own Auto-Clarity section exempts those from compression.

Before you create or edit **any** `CLAUDE.md` in this repo, root or nested:

1. **Invoke the skill first:** `Skill(skill: "caveman:caveman", args: "ultra")`. Read the level table and the Auto-Clarity section out of the skill. Never write caveman style from memory — the level definitions and the carve-outs change, and a remembered version silently drifts.
2. **Skill missing, or the invocation fails → STOP. Do not write the file. Do not approximate the style.** Warn the developer with this text:

   > **Blocked:** the `caveman:caveman` skill is not available. Every `CLAUDE.md` in this repo must be written in caveman *ultra* style, and that spec lives in the skill. Install it, then retry:
   > ```
   > /plugin marketplace add JuliusBrussee/caveman
   > /plugin install caveman@caveman
   > ```
   > Nothing was written.

3. **Ultra means:** abbreviate prose words (DB, auth, config, req, res, fn, impl), strip conjunctions, `X → Y` for causality, one word wherever one word carries it. **Never abbreviate or reword code symbols, function names, API names, error strings, env vars, file paths, or command lines.** They are quoted verbatim or they are wrong.
4. **Auto-Clarity overrides ultra, and it is not optional here.** Write full, unambiguous sentences for: security invariants, destructive or irreversible steps, and ordered multi-step sequences where a dropped conjunction flips the meaning. A security rule compressed into ambiguity is a defect, not a style win. The "Security invariants" section below is the worked example.
5. **Scope is `CLAUDE.md` plus comments in `test/**/*.mts`** and, by convention only, in `test/property/*.ts` (the gate script matches `.mts` only). Test comments carry their own rules — see `test/CLAUDE.md`. `README.md`, `REPO.md`, `docs/code/*.md`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, `docs/*.md` and every comment under `src/` stay normal prose: those are consumer-facing.
6. **This rule is machine-enforced, so step 1 is not optional.** Two `PreToolUse` hooks in `.claude/settings.json` run `scripts/caveman-gate.sh`. The `Skill` matcher records that `caveman:caveman` was invoked in this session; the `Write|Edit` matcher denies any write whose target is named `CLAUDE.md`, or sits under `test/` with a `.mts` extension, when either the skill is not installed or it has not been invoked. The gate fails closed — a prerequisite it cannot verify is a deny, never a warn-and-continue, same standing as the coverage and Qodana gates. The escape hatch is `SKIP_CAVEMAN_GATE=1`, owner only. Do not delete the hooks or the script to unblock a write; invoke the skill instead.

## What this is

`@axiumine/koa-utils` — npm TS util lib for Koa + GraphQL backends. ESM-only (`.mjs` / `.d.mts`). Node ^24.14.0. Mocha + c8 + sinon + chai (`test/`). **Hard 100% coverage**, 3 gates: `.c8rc.json`, `.githooks/pre-commit`, Qodana CI. Every change → consumers via `yarn upload`. Backwards compat matter.

## Always

- Edit `.mts` in `src/`. Never `dist/` — `yarn build` regen it.
- Aliases `@lib/* @throw/* @models/* @context/* @stypes/* @private/* @email/* @dataSources/*`. Imports MUST end `.mjs`, not `.ts`/`.mts` — NodeNext require, `typescript-transform-paths` rewrite at build.
- Tabs (`.editorconfig`). Prettier: no semicolons, single quotes, `trailingComma:none`, `printWidth:129`. Match neighbours. Never reformat unrelated lines.
- New public symbol → matching `package.json` `exports` entry (check `_moduleAliases`). No barrel → 1 export key per consumer-visible file.
- Bcrypt via `encryptPassword` (hash) / `compareHashAsync` (verify). Never `@node-rs/bcrypt` direct. `SALT_ROUNDS=14` intentional.
- Resolver take email/pwd → `email.toLowerCase().trim()`, then `checkEmailLen(uEmail)` / `checkPwdLen(password)`. First thing, always.
- **New or modified `.mts` in `src/` → tests AND doc, same change.** Uncovered line or stale doc = incomplete, not "later".
- Cover every branch, incl unreachable-feeling: each `if`/`else`, every `??` / `?.` / `||` fallback, every `catch`, every early return. `per-file: true` → 1 uncovered ternary arm fail whole run.
- Done = `yarn test:coverage` read 100% on 4 metrics. `yarn test` skip coverage check → passing there not enough.
- **Reindex after every commit + merge:** `yarn reindex`, last step before report done. Stale index → `impact` / `detect_changes` / `query` answer pre-change graph → understate blast radius. `.gitnexus/` gitignored, reindex never dirty tree.
- `yarn reindex` carry `--no-stats`, `.gitnexusrc` set `"noStats": true` → bare `gitnexus analyze` match. Counts = only volatile part of generated block. No flag → every reindex rewrite numbers nothing read → each release drag `chore: refresh counts` commit. Block carry no counts by design. Live numbers → `mcp__gitnexus__*` tools or `gitnexus status`, never pasted back by hand. Rule live here not in block: `analyze` drop any hand-added line between markers.

## Security invariants — violable from anywhere, never compressed, never broken

Full prose by Rule 0 §4. Both of these shipped as real defects.

- **Two hash fields, never interchangeable.** `account.email.hash` proves inbox ownership (signUp activation and email change; 3 day life, `requestTimes` throttle). `account.resetHash` authorises a password reset (60 min life, 10 min throttle, touched only by `saveResetReq` / `getResetPwd` / `removeResetReq`). They shared a single slot through 5.0.3: a hash minted by either flow authenticated the other, and one unauthenticated `resetPwd` call destroyed a pending activation link, driving `requestTimes` up to the 5-strike account delete. Never read `account.email.hash` as a reset-hash fallback, and never write it from a reset path.
- **`account.disabled` and `account.deleted` must stay `type: Boolean`** in both user schemas. `disabled` was `type: String` through 5.0.3, which inverted the flag: Mongoose cast a stored boolean `false` to the string `'false'` on write and on hydrated read, `'false'` is truthy, and every consumer tests it with a bare `if (account.disabled)`. The result was that `_finalizeLoginCheck` answered 403 and sent an "account disabled" email to users explicitly marked NOT disabled, and the flag could not be cleared through the model at all. The schema fix repairs hydrated reads only — `.lean()` readers still see the raw stored value — so existing data must go through `scripts/migrate-account-disabled-to-boolean.mjs`. Do not add runtime coercion at those call sites: the migration is the fix, and that is the owner's decision.

## Coverage — hard 100%

- `.c8rc.json`: `check-coverage: true`, `per-file: true`, `lines`/`statements`/`functions`/`branches` all `100`. Any file below → `yarn test:coverage` exit non-zero.
- `.c8rc.json` `include` = `dist/**/*.mjs` + `scripts/check-code-caps.mts` + `scripts/code-caps/**/*.mts` → caps tool + specs held to same 100%. Other `scripts/` = measurement tools, outside include, no spec.
- `.githooks/pre-commit` order: lockfile check (always) → `yarn -s check:static` → `yarn test:coverage` → Qodana last. Run on any commit touching `src/`, `test/`, `scripts/`, `package.json`, `.c8rc.json`, `.mocharc.json`, `tsconfig*.json`, `eslint.config.js`, `eslint-suppressions.json`, `knip.config.js`, `fta.json`, `.code-caps-baseline.json`. Docs-only skip all heavy steps. Wired by `yarn hooks:install` (via `prepare`) → `core.hooksPath .githooks`.
- `.githooks/pre-push`: `yarn -s check:static` again (catch `--no-verify` commits) → `yarn -s ratchet:against` (merge base w/ `origin/main`) → `scripts/semgrep.sh` → `scripts/semgrep-canary.sh` → `yarn mutation:changed <range base>` (only when range touch `src/**/*.mts`; ~35 s per file + 30 s fixed; fail below `thresholds.break`). Run on pre-commit paths + `.semgrep/` + `.github/workflows/semgrep.yml`. Skip branch delete + docs-only range. Prereq missing (yarn, `node_modules`, `stryker` / `patch-package` bins, `origin/main` ref, python3, docker, daemon, pinned `SEMGREP_IMAGE` local) → print 1 fix cmd, exit 1. Never pull. Offline-safe: no `--registry` packs, semgrep scripts pass `--disable-version-check`. No `SKIP_*`.
- Red gate → new test. Never lower threshold, never new exclude.
- `.c8rc.json` `exclude` = untestable artefacts only: type-only emit (`I*.mjs`, `types/`, `interfaces/`, `TCommonHeaders`, `TCookieRefreshToken`), fully commented-out `checkForNSFW.mjs`, build output. Never park real logic there for green.
- Truly unreachable defensive branch → raise with owner before excluding. Never add `/* c8 ignore */` on own initiative.
- Invariant = 100% per file every run, not a fixed test count. Read numbers off `yarn test:coverage` summary. Below 100% = bug in change, not in gate.

## Docs — sync same commit

Docs hand-written (1 exception: `<!-- gitnexus:start -->` block). Nothing verify them → drift silent → consumers read stale version on npm. Doc = part of code change, never follow-up.

| You changed | Update |
|---|---|
| `src/dataSources/**` | `docs/code/data-sources.md` |
| `src/email/**` | `docs/code/email.md` |
| `src/files/**` | `docs/code/files.md` + `src/files/Readme.md` |
| `src/graphQL/models/**` | `docs/code/graphql-models.md` |
| `src/graphQL/schema/context/**`, `schema/interfaces/**` | `docs/code/graphql-context.md` |
| `src/graphQL/schema/mutations/**`, `schema/GraphQLInput/**` | `docs/code/graphql-mutations.md` |
| `src/graphQL/schema/types/**` | `docs/code/graphql-types.md` |
| `src/graphQL/throw/**`, `src/graphQL/status.mts` | `docs/code/graphql-errors.md` |
| `src/koa/*.mts`, `src/koa/router/**` | `docs/code/koa-core.md` |
| `src/koa/middleware/**` | `docs/code/koa-middleware.md` |
| `src/lib/*.mts` (core helpers) | `docs/code/lib-core.md` |
| `src/lib/access/**` | `docs/code/lib-access.md` |
| `src/lib/db/**` | `docs/code/lib-db.md` |
| `src/lib/MariaDB/**`, `lib/MongoDB/**`, `lib/PostgreSQL/**` | `docs/code/lib-datasource-errors.md` |
| `src/lib/Redis/**` + remaining `src/lib/` utilities | `docs/code/lib-utilities.md` |
| `src/private/**` | `docs/code/internal.md` |
| Any file added/removed/moved under `src/` | `REPO.md` |
| New file under `.github/` or new root doc (`SECURITY.md`, `CONTRIBUTING.md`, ...) | `REPO.md` |
| Major `version` bump | `SECURITY.md` supported-versions table |
| `.github/workflows/release.yml` | `CLAUDE.md` (Release pipeline section) + `docs/verify-release.md` |
| Public API surface, install steps, `engines`, usage examples | `README.md` |
| New `docs/code/*.md` page, or `version` in `package.json` | `docs/code/README.md` (index table + "Current version") |
| Repo-wide agent rule: scripts, thresholds, aliases, gates, publish policy | `CLAUDE.md` (this file) |
| Agent rule scoped to 1 area: local convention or pitfall | nested `CLAUDE.md` in that dir, not this file |
| Nothing by hand — `yarn reindex` regen | `AGENTS.md`, `<!-- gitnexus:start -->` block here |

**Doc change, not just code change:** rename/remove exported symbol, or change signature / param names / param types / return type; change HTTP status, error `title` or `description` in a `throwXxx` (`docs/code/graphql-errors.md` quote verbatim); add/remove Mongoose or GraphQL field; change Redis key format, cookie name, env var name, TTL; change observable behaviour a doc describe in prose. New export → `docs/code/README.md` + area doc + `REPO.md` + `package.json` `exports` move together.

**Before report done:** `git diff --name-only` → every touched `src/` path, mapped doc in diff too, or state why no documented claim affected. Re-read edited sections → every snippet still compile against real signature. Snippet not matching impl worse than no snippet. Bumped `version` → "Current version" line in `docs/code/README.md`, same commit.

## Never

- No `src/` change without mapped doc, same commit. No "docs to follow" TODO. Affect no documented claim → say so in summary, not silence.
- No hand-edit of `AGENTS.md`, nor anything between `<!-- gitnexus:start -->` / `<!-- gitnexus:end -->` — `analyze` overwrite both.
- No dropping `--no-stats` from `yarn reindex` or `"noStats": true` from `.gitnexusrc` to "show graph size".
- No editing `dist/`, `node_modules/`, `yarn.lock`, `skills-lock.json`, `.npmrc`, `.yarnrc` unasked. `.npmrc` hold publish token.
- No committing `yarn.lock` with `resolved` host ≠ `registry.npmjs.org`. No hand-fixing a proxy-flavoured copy — clean filter handle it. No removing `.gitattributes`, `scripts/lockfile-registry-filter.sh`, or the filter git config to silence the hook.
- Never add a `preinstall`, `install` or `postinstall` script to `package.json`. This package is published to npm and the `scripts` block travels in the tarball, so an install-lifecycle script would execute on every consumer's machine, where dev dependencies such as `patch-package` do not exist; at best it fails the consumer's install, at worst it runs code the consumer did not expect. Dev-only setup goes in an explicit script (`yarn mutation` applies the Stryker patch itself) or in a CI step.
- No lowering `stryker.config.json` `thresholds.break`. Ratchet only up. No new Stryker `mutate` exclude to green a score. `// Stryker disable` only per *Mutation gate* below.
- No `.ts` files — ext is `.mts`. Exceptions: `scripts/semgrep-canaries/**` (Semgrep fixtures), `test/property/*.spec.ts` (fast-check; Scorecard Fuzzing scan `*.ts` / `*.tsx` only, never `.mts`; knob `FC_NUM_RUNS`; comments stay caveman ultra; see `test/CLAUDE.md`). No `import x from './y'` — write `'./y.mjs'`.
- No `dependencies` in `package.json`. Zero runtime deps, all `peerDependencies` → consumer control versions. 19 peers: 7 hard (`@node-rs/bcrypt`, `@sentry/node`, `dotenv`, `graphql`, `mongoose`, `redis`, `uuid`), 12 `optional` via `peerDependenciesMeta`.
- No breaking the optional-peer invariant. `optional` = claim about load path, not warning mute. True only while dep reachable solely through subpath consumer opt into by importing it. Two ways to break, both silent, both hit every consumer: add root `"."` key to `exports` (1 import drag whole graph in), or import an optional dep from a module every subpath reach. Need it on a common path → lazy `await import('pkg')`, like `src/private/files/_validateMimeType.mts` do for `file-type`. `.d.mts` carry same boundary — `dataSources/PostgreSQL` types name `sequelize`, so `skipLibCheck: false` consumer of that subpath still need it installed.
- No moving a peer between hard and `optional` by guess. Walk `exports` transitively over built `dist/` first, count subpaths reaching it, then decide. Hard ≠ "every subpath load it" — none do; widest is `graphql`, 72 of 150 (static-import walk, built `dist/`, 7.1.0; dynamic `await import()` not counted). Count drift per release → re-walk, never copy this line.
- No `*` range in `peerDependencies`. `*` accept any major → `sharp` 0.34 → 1.0 install silent, break at runtime, no warning. Upper bound only, no floor: `"sharp": "<1"`, `"mongoose": "<10"`, `"redis": "<7"`. `keygrip` keep own `^1.1.0`.
- No peer upper bound derived from `devDependencies` alone. Pin record what repo build against, not what npm serve. Bound below npm `latest` → hard peer reject the default install: Yarn 1 `has incorrect peer dependency`, npm 7+ `ERESOLVE`, install fail. Shipped exactly that in 5.7.1 — `"graphql": "<17"` vs published 17.x, `"redis": "<6"` vs published 6.x. Procedure, both steps required, in order: first read the published major with `npm view <pkg> version --registry=https://registry.npmjs.org/`; then set the bound at the major above whichever is higher, the repo pin or that published version. Raising a bound over a major the repo never built is a claim of compatibility — swap the new major into `node_modules`, run `yarn test:coverage` green, restore, and only then write the range. Never widen a bound merely to clear an `ERESOLVE`.
- No floor added to a peer range. Floor assert a minimum never tested here → working consumer get `has incorrect peer dependency`, npm 7+ `ERESOLVE`, for a combo fine yesterday. Range change must warn nobody already installed.
- Dependabot never bump `peerDependencies`; peer rules above unchanged. It read `devDependencies` only, but textual-replace a bumped dev line inside the `peerDependencies` block too when text identical. Dependabot PR editing a peer line → reject. New peer in `package.json` → add `ignore` entry (`version-update:semver-major`) in `.github/dependabot.yml`. 0.x peer (today `reflect-metadata`, `sharp`) → entry also needs `version-update:semver-minor`: Dependabot count only ≥1.0 as major → `0.2.x` → `0.3.0` arrive as minor, escape `<0.3` peer. `keygrip` ignored whole for that reason. Ignore list = guard, not guarantee: filter only what Dependabot propose; hand edit or new peer w/o entry uncovered → read `package.json` hunk of every Dependabot PR before merge.
- No `.mjs.map` in published tarball. `files` negate `dist/**/*.mjs.map` + `dist/**/*.js.map`. `tsconfig.json` carry `"inlineSources": true` → every map embed whole original `.mts` as `sourcesContent`, `src/private/**` included, 363 kB / 190 files. Build keep emitting them → local `--enable-source-maps` keep working, only publish surface narrow. Verify `npm pack --dry-run` → 0 `.map`. Never drop negation.
- No `console.debug` in `src/`, no commented-out `console.*` left behind — owner cleared both in 5.6.0. `console.info` / `console.error` / `console.log` stay put (`src/dataSources/**`, `src/files/scanVirus.mts`, upload helpers): they carry conn + error reporting. Debug via breakpoint or temp local edit.
- No constant replacing `accessTokenExpiry()` 30–90 min jitter.
- No barrel `index.mts`, root or any subdir — exports per-file by design.
- No import from `src/private/**` outside package. No `private/*` in `package.json` `exports`.
- No `yarn upload` / `npm publish` / `npm deprecate` / `gh release create` / `gh release edit` / `gh workflow run release.yml` unless user explicitly ask. Outward-facing, consumer-visible, owner call. Publishing a GitHub release starts `release.yml`, which publishes to npm once the owner approves environment `npm-publish`.
- No destructive git (`reset --hard`, `clean -fd`, force-push) without confirmation.
- **Never commit on `main`.** Ordered sequence, full prose by Rule 0 §4. Before the first edit of a task, run `git switch -c <type>/<slug>` and commit on that branch. Merging into `main` is the owner's decision alone: never merge, fast-forward, squash or rebase onto `main` unless the owner asks for it in that message. Being checked out on `main` is not permission to commit to it, and an instruction to "commit and push" means commit the branch and push the branch. Branch name reach the merge subject → banned-word check apply to it too, see *Owner / style*.
- Mocha = runner. No swap.
- No lowering/deleting `.c8rc.json` thresholds or `qodana.yaml` `testCoverageThresholds` — contract, not default. No `.c8rc.json` exclude, no `/* c8 ignore */`, to green a red gate. Write test.
- No `git commit --no-verify`, no `SKIP_QODANA=1`, no suggesting either to user as fix. Owner emergency only — CI block anyway.
- No softening hook Qodana prereqs into warnings. No `docker pull` inside hook.
- Never raise any value in `.code-caps-baseline.json`, and never add an entry to it by hand. `yarn caps:update` only lowers values and removes entries; it is the only way that file changes. A cap violation is fixed by splitting the code. `--accept` rewrites the whole baseline and is for the owner only.
- Never hand-edit `eslint-suppressions.json`. It changes only through `eslint --suppress-all` / `--suppress-rule` (owner adopting a rule) and `eslint --prune-suppressions` (shrinking). A count that goes up is a new violation: fix the code.
- Never raise a cap (`LIMITS` in `scripts/code-caps/measure.mts`, ESLint `max-*`, `complexity`), raise `fta.json` `score_cap`, or lower a `type-coverage` bar (`--at-least` values in `package.json`) or a `tsc` strict flag to pass a gate. Fix the code. Bars only move toward stricter.
- `typescript-eslint` + `@typescript-eslint/*` move together, same version. Bump 1 alone → peer mismatch.
- No disable/delete/edit of `.githooks/pre-commit`, `.githooks/pre-push` or `.githooks/commit-msg` unasked. Widening allowed commit types to pass a message = same violation → rewrite message.
- No deleting the `PreToolUse` hooks in `.claude/settings.json` or `scripts/caveman-gate.sh` to land a `CLAUDE.md` or `test/**/*.mts` write. Blocked write → invoke the skill, not remove the gate. Rule 0 §6.
- No normal-prose comment in `test/**/*.mts` — caveman ultra, see `test/CLAUDE.md`. `describe` / `it` description strings not comments → stay prose. `src/` comments stay prose.

## Build / lint

- `yarn build` — prod ESM build (`yarn clean && yarn build:esm`). `tspc` (ts-patch) apply `typescript-transform-paths` → emitted `.mjs` carry relative imports.
- `yarn build:all` — ESM + CJS dual. Only when explicitly needed.
- `yarn lint` — `eslint --fix` then `prettier --write 'src/**/*.mts' 'scripts/**/*.mts'`. Run after every multi-file edit.
- `yarn lint:check` — `eslint --max-warnings 0 --cache` then `prettier --check`. Read-only, no fix. Part of `check:static` → red CI = run `yarn lint`.
- `yarn check:static` — `caps` → `lint:check` → `typecheck` → `typecheck:scripts` → `knip` → `type-coverage` → `fta`. Single source: pre-commit, pre-push, CI step `Static gates` all call it. Run before report done.
- `yarn typecheck` (`tsconfig.check.json`, `exactOptionalPropertyTypes`) / `yarn typecheck:scripts` (`tsconfig.scripts.json`) / `yarn knip` / `yarn type-coverage` / `yarn fta` (cap `fta.json`, 64 → target 50 after refactor, owner) — 1 gate each.
- `yarn caps` — code-size ratchet vs `.code-caps-baseline.json`. `caps:update` only lower. `caps:report` list all.
- `yarn mutation` — `patch-package && stryker run`. Full run, ~30 min, sandbox (tree untouched). Report `reports/mutation/index.html`. See *Mutation gate*.
- `yarn mutation:changed [base-ref]` — mutate only `src/**/*.mts` changed vs merge-base (default `origin/main`, else `HEAD~1`). Own incremental file, clear-text report only.
- `yarn leak:check` — heap tripwire on built `dist/` (`yarn build` first). CI weekly/dispatch only, advisory.
- Snapshots: `test/__snapshots__/*.json`. Regen `UPDATE_SNAPSHOT=1 yarn test`, only on intentional API change, read diff. See `test/CLAUDE.md`.
- `yarn clean` — wipe `dist/`.
- `yarn test` — `build` + `build:tests` + mocha. No coverage check.
- `yarn test:coverage` — same via c8, **fail below 100%** on any file. This command decide change finished. Feed Qodana coverage gate too.
- `yarn hooks:install` — set `core.hooksPath .githooks` **and** install lockfile registry filter. Idempotent, no-op outside git repo, run from `prepare`.
- `yarn reindex` — `node .gitnexus/run.cjs analyze --no-stats`.
- `yarn qodana` / `yarn qodana:cli` — `test:coverage` → Qodana scan → open report.
- `yarn upload` — `npm publish --registry=https://registry.npmjs.org/`. Flag load-bearing, see below. Owner ask only. Manual fallback path: no provenance, no release assets. Per version ONE path: `yarn upload` XOR `release.yml`. 2nd fail, version already on npm.

## Mutation gate — StrykerJS

c8 100% prove lines ran, not that tests assert. Stryker mutate `src/**/*.mts`, rerun tests, survivor = missing assertion. Config `stryker.config.json`: runner `mocha`, checker `typescript`, `coverageAnalysis: perTest`, `incremental` (file `reports/stryker-incremental.json`), `inPlace: false` → sandbox copy in `.stryker-tmp/`, working tree never rewritten. Mutate set mirrors `.c8rc.json` excludes (`I[A-Z]*.mts`, `types/*`, `interfaces/**`, `TCommonHeaders`, `TCookieRefreshToken`, `checkForNSFW`). Build in sandbox: `scripts/mutation-build.sh` (clean + `build:esm` + `build:tests`; links `node_modules` itself because Stryker build run before link).

- Target = 100% of non-disabled mutants. `thresholds.break` = 67 now (measured baseline 67.69%) → 100 as survivors die. Raise only, never lower.
- Survivor → new assertion in `test/`, never `thresholds` edit.
- `// Stryker disable next-line <Mutator>[,<Mutator>]: <reason>` (or block form `// Stryker disable <Mutator>: <reason>` … `// Stryker restore <Mutator>`) only for TRUE equivalent mutant: mutated program behave identical for every input. Reason must say why, verified (read diff, try to write killing test first). Banned reasons: "hard to test", "not worth", "covered elsewhere", "flaky". Unverified → write test. Stryker disable = allowed (owner decision) for true equivalents only. `/* c8 ignore */` still banned.
- Never run 2 Stryker runs or `yarn test` in same checkout concurrently (shared `dist/`, though sandbox isolate most). Shard = own worktree.
- `.stryker-tmp/` and `reports/` gitignored + listed in `qodana.yaml` `exclude` (generated HTML report = 1000+ High findings → blocks pre-commit Qodana). Output only, not a threshold change.
- mocha-runner 10.1.1 crash on Mocha 12 → `patches/@stryker-mutator+mocha-runner+10.1.1.patch` (`patch-package`, 1 file `lib-wrapper.js`). Applied by `yarn mutation` and `mutation.yml` step only (rule below), idempotent. Remove when upstream support Mocha 12 → steps in `TODO.md`. Patch bump of plugin → patch name/version stale → regenerate or drop.
- `patch-package` must never run from a `preinstall`, `install`, `postinstall` or `prepare` script in `package.json`. This package is published, so the `scripts` block travels in the tarball and such a script would run on every consumer machine, where `patch-package` is not installed and the install would fail. Only the `mutation` script and the `mutation.yml` step may apply the patch.

## PR flow — branch → PR → merge commit

- Work land via PR from the `<type>/<slug>` branch. Owner merge with merge commit: `gh pr merge <n> --merge`. Never squash, never rebase → Scorecard Maintained + Code-Review count branch commits + merge commit, squash collapse them.
- Agent push branch / `gh pr create` only when owner ask in that message. Merge stay owner call, see *Never*.
- When the main ruleset is enabled: direct push to `main` rejected, owner included → "merge branch then push `main`" habit stop working. Owner-only bypass `gh pr merge <n> --merge --admin`, after `Test coverage` green.
- Required check = `Test coverage` (job `name:` in `.github/workflows/ci.yml`). Rename job → update ruleset same change, else every PR block on a context nothing report.

## npm proxy — `yarn.lock` stay public

Maintainer install via LAN Verdaccio (`http://yarnproxy.gio.lan:4873/`, gitignored `.yarnrc`). Yarn 1 write absolute tarball URLs → host leak into git → `yarn install` break for every off-LAN clone. Published tarball safe: `files: ["dist"]` keep lockfile out. Only clones break.

- Filter `yarnlock-registry` handle both directions: `clean` (worktree → git: `add`, `diff`, `status`) proxy → `registry.npmjs.org`; `smudge` (git → worktree: `checkout`, `clone`, `pull`) reverse. `.gitattributes` bind `yarn.lock`. Definition live in `.git/config` → other clones fall through, get public URLs.
- `scripts/lockfile-registry-filter.sh clean|smudge|install|uninstall`. `install` wire git config **and** reconcile current checkout — git never re-smudge a file it think up to date. Run from `hooks:install`. Per-machine override: `YARN_PROXY_REGISTRY=http://other:4873/`.
- `clean` run for `git diff` / `git status` too → host diff never show as modification. Lockfile look clean while worktree hold proxy URLs. `integrity` untouched — Verdaccio serve byte-identical tarballs, only URL differ.
- `.githooks/pre-commit` backstop: read `:yarn.lock` from index, block any `resolved` host ≠ `registry.npmjs.org`. Catch clones where filter never configured. Keep pipe-free — `git show | grep -q` exit early → `git show` take SIGPIPE → `pipefail` turn pipeline falsy → check silently never fire.
- **`yarn upload` keep `--registry=https://registry.npmjs.org/`.** Yarn 1 export `.yarnrc` registry to child proc as `npm_config_registry` → bare `npm publish` run *through* yarn hit proxy. Shipped broken 5.0.0 → 5.0.2: `ENEEDAUTH` vs mirror, or worse, silent LAN publish npmjs never saw. npm precedence: CLI flag > env var. Work typed straight in shell only because that skip yarn. Verify `yarn upload --dry-run` → output must name `registry.npmjs.org`. Any `yarnproxy` host → flag lost.
- Yarn Berry 4.x fix natively (hostless `resolution: "pkg@npm:1.0.0"`, registry from `.yarnrc.yml`). Migration = real fix if repo ever leave Yarn 1.

## Qodana — gate before publish, not after

`.githooks/pre-commit` block **the commit**, on anything touching `src/`, `test/`, `scripts/`, `package.json`, `.c8rc.json`, `.mocharc.json`, `tsconfig*.json`, `eslint.config.js`, `eslint-suppressions.json`, `knip.config.js`, `fta.json`, `.code-caps-baseline.json`. `.github/workflows/qodana.yml` (push/PR to `main`, manual dispatch) block **nothing** → report after the fact. CI alone not a gate here: `yarn upload` = local manual step, run beside CI not behind it. 5.6.0 published, CI red ~3 min later, broken tarball already public. Gate values in `qodana.yaml`, both places read it: `severityThresholds` critical 0 / high 0, `testCoverageThresholds` fresh 100 / total 100.

- Hook run docker direct, not `yarn qodana` — that script re-run `test:coverage` hook already did. Reuse report c8 just wrote.
- **Never pull inside hook.** Auto-pull broke 5.6.1 CI: Docker Hub timeout → `qodana-action` fell to `--skip-pull` → container never started → failure carried no verdict, 156-byte empty report. Pulling hook inherit that flake → network blip = failed commit.
- **Never skip.** Gate that step aside when it cannot run is not a gate. Every prereq — docker in `PATH`, daemon reachable, `qodana.yaml` present with `linter:` tag, `.env` present with `QODANA_TOKEN`, image already local — block commit, print the one fixing command, exit 1. Missing image → print `docker pull <linter>`, stop. Never warn-and-continue. Fail-open was this hook's first shape and it was wrong: single CODEOWNER, gate exist to run before publish.
- Linter tag read from `qodana.yaml` at run time, never hard-coded → bumping `linter:` must not leave hook scanning older image than CI.
- `QODANA_TOKEN` from `.env` via `--env-file`. Qodana 2023.2+ refuse to start without it.
- No `--show-report` in hook — serve on a port → hang the commit.
- Escape hatch `SKIP_QODANA=1 git commit`, narrower than `--no-verify` (keep coverage + lockfile gates). Owner only.
- Exit code cover infra failure as well as findings. Red hook + empty report = infra, not finding. Check `.qodana/results/report/index.html` before believing block.
- CI: `gh run list --workflow=qodana.yml` → `gh run view <id> --log-failed`. Red ≠ finding. Look for `can't pull image` / `couldn't create the container` first → `gh run rerun <id> --failed`.
- `release.yml` `verify` require green `qodana.yml` run on tagged SHA → release-workflow path CI-gated. `yarn upload` path still gated by pre-commit hook only.

## CI workflows — `.github/workflows/`

The next four rules are supply-chain security invariants, so they are written in full sentences on purpose (Rule 0 §4). Scorecard scores them (Pinned-Dependencies, Token-Permissions), and a violation is also a real attack surface.

- Every `uses:` reference is pinned to a full 40-character commit SHA followed by a comment naming the release, for example `uses: actions/checkout@<sha> # v7.0.1`. Never pin by tag or branch, and never call a reusable workflow by tag. Before writing a new SHA, confirm it with `gh api` against the tag, dereferencing annotated tags.
- Every workflow has a top-level `permissions: contents: read`. A write scope (`security-events`, `id-token`, `checks`, `pull-requests`) is granted only at job level, and only to the one job that needs it. Never grant a write scope at workflow level.
- No workflow runs `npm install`, `pip install` or `curl ... | bash`. Dependencies come from `yarn install --frozen-lockfile` or from a pinned action or image.
- Never put an expression such as `${{ github.event.* }}` inside a `run:` script, because event payload text is attacker-controlled. Pass it through `env:` and read the shell variable.

- Job `Test coverage` (required check, name fixed) hold step `Static gates` = `yarn check:static`, before `yarn test:coverage`. Old `Coding standard` step folded in. Static gate → inside this job, never a new required context.
- Advisory jobs, not required checks: `Trivy` (digest-pinned image, `--exit-code 1`; ghcr rate limit → red = rerun first), `Leak check` (schedule/dispatch only), `mutation.yml` (weekly Sun 03:43 UTC + dispatch, 120 min). Never hook, never required without ruleset edit. Semgrep registry packs (`--registry`) = CI `semgrep.yml` only, never hook, never `release.yml`.
- YAML in `.github/` = 2 spaces, overrides `.editorconfig` tabs (tab invalid in YAML).
- `qodana-action` bump (hand or Dependabot) travels with `qodana.yaml` `linter:` and `--linter` arg in `qodana.yml` → all same version, else CI + hook scan different images. Dependabot cannot bump the two → check by hand.
- `SEMGREP_IMAGE` (tag + `@sha256` digest) identical in `semgrep.yml` and `release.yml`. Change both same commit.

## Release pipeline — `.github/workflows/release.yml`

Owner only. Agent never trigger it, see *Never*.

- Trigger: owner publish GitHub release `vX.Y.Z`. `workflow_dispatch` = dry run, `verify` job only. Never add `push` / `pull_request` / `schedule` trigger.
- `verify`: tag == `v` + `package.json` `version`; stable `x.y.z`; tag commit ∈ `origin/main`; version absent on npm; green `qodana.yml` run for SHA; `yarn test:coverage`; semgrep canary + scan; `yarn build`; `npm pack --ignore-scripts`; tarball allowlist `dist/` `LICENSE` `README.md` `package.json`, 0 `.map`.
- `publish`: env `npm-publish` (reviewer = owner, tag rule `v*`; create BEFORE npm trusted publisher + first release, see invariants below), OIDC trusted publishing, provenance. `release-assets`: `actions/attest-build-provenance` → upload `<tgz>.intoto.jsonl` + `<tgz>` to the release.
- Why `.intoto.jsonl`: Scorecard Signed-Releases = 10 only if each of 5 newest releases-with-assets carry asset ending `.intoto.jsonl`. Name check only, content unread. `.sig` / `.sigstore.json` = 8 max.
- Consumer verify: `gh attestation verify <tgz> --bundle <tgz>.intoto.jsonl --repo Axiumine/koa-utils` → `docs/verify-release.md`. `slsa-verifier` not read this format.
- Release order (owner): bump `version` + `CHANGELOG.md` + `docs/code/README.md` (+ `SECURITY.md` table on major) → merge `main` → wait green `qodana.yml` → push signed tag `vX.Y.Z` → `gh release create vX.Y.Z --verify-tag --notes-file <file>` → approve `npm-publish` → run green → `npm view` + `gh attestation verify`. Release target = `main`, never a `release/*` branch.
- Version published via `yarn upload` → no GitHub release for it: `release.yml` would fail its npm guard.

Security invariants of `release.yml`, written in full sentences on purpose. The `publish` job holds the npm OIDC token, so it must never check out the repository and must never install dependencies; it only publishes the tarball that `verify` built and tested, after re-checking its sha256. Every action in the workflow is pinned by full commit SHA with a `# vX.Y.Z` comment and never by tag. The workflow never stores an npm token: authentication is OIDC trusted publishing only, bound on npmjs.com to the file name `release.yml` and the environment `npm-publish`, so renaming either one breaks publishing until the trusted publisher is recreated. The environment `npm-publish` must keep its required reviewer and its tag-only deployment rule, otherwise a branch carrying an edited copy of the workflow could request the OIDC token. The environment `npm-publish` must therefore exist, with the required reviewer and the `v*` tag-only deployment rule already set, before the npm trusted publisher is configured and before the first release is cut: GitHub silently creates a referenced but missing environment on the first run with no reviewer and no tag rule, which removes that guarantee. Check with `gh api repos/Axiumine/koa-utils/environments`; an empty list means the environment does not exist yet. The `registry-url` of the `publish` job stays `https://registry.npmjs.org` without a trailing slash, because Scorecard's Packaging check compares that exact string. GitHub immutable releases must stay disabled, because the assets are attached after the release is published and an immutable release would reject them. A GitHub release is created only to publish a new version through this workflow, because the workflow is what attaches the `.intoto.jsonl` provenance asset. A release that holds assets but no `.intoto.jsonl` scores 0 on Signed-Releases, so never attach, replace or delete release assets by hand. Never back-fill releases for old tags, and never create a release for an already published version: it starts the workflow, which then fails its guard.

## Deprecating superseded versions

Broken version stay installable forever via exact pin or stale lockfile. Semver range carry nobody forward — `^5.0.0` only help consumers who re-resolve. `npm deprecate` = only channel reaching a pinned install. **Bump `version` for a fix → ask whether superseded version need deprecating. Raise with owner before publishing.**

- Deprecate on real defect: auth bypass, enumeration oracle, data corruption, swallowed error, wrong HTTP status, broken artefact. Rule of thumb — anything earning `### Security` or `### Fixed` in `CHANGELOG.md` that change observable behaviour.
- **Never blanket-deprecate merely-old versions.** Deprecation mean "this version bad", not "not newest". Blanket → consumers ignore warning, and it fire in CI for every lockfile pin — exactly the audience needing the signal for a real defect. No published version stay undeprecated as of 6.0.0: the introspection env gate gave every version `<= 5.9.0` a real defect, so all 19 carry a message. Still not a blanket — 9 tiers, each name its own defect class, each keep the older defect it already named. (`5.7.2` / `5.8.0` were this rule's worked example until 6.0.0 gave them a defect too → both deprecated now, so the example is currently empty. Example go stale each release — read npm, never this line: `npm view '@axiumine/koa-utils@>=4' deprecated --registry=https://registry.npmjs.org/`.)
- Owner ask only, same standing as `yarn upload`. Read `CHANGELOG.md` first for the real cutoff per defect — "fixed in 5.4.0" → every version `<= 5.3.0` carry it. Never guess range off version numbers.
- 1 command per defect class, not 1 blanket range. Message name the defect + the fixed version — that string is all a consumer see at install time. Tier ranges when reasons differ; message vague enough to cover everything = message nobody act on.
- Pin registry, same reason as `yarn upload`:
  ```
  npm deprecate '@axiumine/koa-utils@<=5.3.0' "Security: <what breaks>. Upgrade to <fixed>. See CHANGELOG <version>." --registry=https://registry.npmjs.org/
  ```
- Verify: `npm view '@axiumine/koa-utils@>=4' deprecated --registry=https://registry.npmjs.org/`. Propagation lag → immediate read-back can come back empty. Retry before concluding command failed. Reversible: same command, empty message (`""`).
- Nothing in repo record a deprecation. `CHANGELOG.md` = source of truth for *why* → message quote it, not restate it.

## Adding a new export — checklist

Ordered. Do not reorder.

1. Create `src/<area>/<Name>.mts`, single named export.
2. Path aliases for cross-area imports; relative `./X.mjs` inside same folder.
3. Add to `package.json` `exports`:
   ```json
   "./<area>/<Name>": {
     "import": "./dist/<area>/<Name>.mjs",
     "types": "./dist/<area>/<Name>.d.mts"
   }
   ```
4. `yarn build` → confirm emit + types.
5. Add `test/<area>/<Name>.spec.mts` mirroring `src/` path, cover every branch.
6. `yarn test:coverage` → 100% on 4 metrics. Less = commit hook block.
7. Bump `version` in `package.json` (patch fix / minor additive / major breaking). Don't bump unless asked.
8. Was a fix → check whether superseded version need deprecating. Raise with owner, never run `npm deprecate` unasked.

## Auth flow — which dir to enter

- `signUp` → user row, `account.email.valid=false` + email hash → send verify mail. → `src/graphQL/`
- `routerVerifyEmail` (`/check/verify-email/:email/:hash`) → `handleIf*` chain → `enableEmailAccess` → redirect. → `src/koa/router/`, guards in `src/private/lib/access/`
- `login*` → `checkUserLoginAuthorization` (bcrypt) → uuid access + refresh → `setRedisLoginSession` → `setLoginCookies` (refresh cookie). Body return `{ accessToken }`. → `src/graphQL/` + `src/lib/`
- `authenticatedResourceHandler` — resource APIs. Read `Authorization: Bearer access:<uuid>` → validate via Redis → populate `ctx.state.user` (`id: ObjectId`). → `src/koa/middleware/`
- `authenticatedAuthorizationHandler(keys)` — refresh endpoint only. Verify signed `refresh_token` cookie via Keygrip → read Redis refresh hash.
- `refresh` → rotate both tokens (30–90 min access, 90 d refresh) → delete old refresh entry → set new cookie.
- `authenticatedLogoutHandler` + `logout` → delete refresh (+ optional access) Redis keys → clear cookie.
- Reset-pwd + verify-email = model-agnostic factories. → `src/lib/access/`

## Owner / style

- Maintainer: Giovanni Manzoni (`@giovannimanzoni`). Single CODEOWNER. License GPL-3.0-or-later → any added file must be compatible.
- Conventional commits, enforced by `.githooks/commit-msg`.
- **Whole message ≤ 150 chars** (`MAX_LEN=150`), subject + body counted together. Hook hard-reject above. 1 number, 1 check — no separate subject cap, no body line count, no wrap width.
- **Allowed types exactly `feat|fix|chore|docs|refactor|ci`.** `test:`, `build:`, `perf:`, `style:` rejected, even though older commits used them. Scope optional (`feat(auth): ...`). Never widen hook to fit a message — pick a type that fit.
- **No `!` breaking marker.** `feat!: ...` fail regex. Signal breaking change in body.
- **Banned words anywhere in message: `Co-Authored-By`, `Claude`, `anthropic`, `Sonnet`, `Opus`** (case-insensitive). Hook reject. Never append AI attribution trailer in this repo, whatever default elsewhere.
- Match is substring, case-insensitive → a commit message can never name `CLAUDE.md`, `.claude/settings.json`, `scripts/caveman-claudemd-gate.sh`, nor a branch whose name carry those. Say "agent rule file" / "project settings file" / "gate script" instead, and rename the branch before merging — `Merge branch '...'` carry the branch name into the subject. Never widen hook to fit. Rule live here: a blocked message is a rewrite, not a hook edit.
- Merge + revert commits skip format check, still hit banned-word check.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **koa-utils**. Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user. For unified PDG impact, add `mode: "pdg"` with optional `line: <N>` — it returns statement-level `affectedStatements` over CDG + REACHING_DEF and inter-procedural symbols in `interproceduralByDepth`/`byDepth`; no-layer/degraded PDG results are UNKNOWN-risk notes (`--pdg` layer).
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).
- For control/data dependence, `pdg_query({mode: "controls", target: "fileOrSymbol"})` answers "under what condition does X run?" (CDG, incl. guard clauses) and `pdg_query({mode: "flows", target, variable})` traces "where does variable Y flow?" (REACHING_DEF). `--pdg` layer.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/koa-utils/context` | Codebase overview, check index freshness |
| `gitnexus://repo/koa-utils/clusters` | All functional areas |
| `gitnexus://repo/koa-utils/processes` | All execution flows |
| `gitnexus://repo/koa-utils/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
