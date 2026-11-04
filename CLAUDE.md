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

`@axiumine/koa-utils` — npm TS util lib for Koa + GraphQL backends. ESM-only (`.mjs` / `.d.mts`). Node ^24.14.0 || ^26.13.0 (`engines`; CI test both floors). Mocha + c8 + sinon + chai (`test/`). **Hard 100% coverage**, 3 gates: `.c8rc.json`, `.githooks/pre-commit`, Qodana CI. Every change → consumers via `yarn upload`. Backwards compat matter.

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
- `.githooks/pre-push`: `yarn -s check:static` again (catch `--no-verify` commits) → `yarn -s ratchet:against` (merge base w/ `origin/main`) → `scripts/semgrep.sh` → `scripts/semgrep-canary.sh` → `yarn mutation:changed <range base>` (only when range touch `src/**/*.mts`; ~35 s per file + 30 s fixed; fail below `thresholds.break` = 100). Run on pre-commit paths + `.semgrep/` + `.github/workflows/semgrep.yml`. Skip branch delete + docs-only range. Prereq missing (yarn, `node_modules`, `stryker` / `patch-package` bins, `origin/main` ref, python3, docker, daemon, pinned `SEMGREP_IMAGE` local) → print 1 fix cmd, exit 1. Never pull. Offline-safe: no `--registry` packs, semgrep scripts pass `--disable-version-check`. No `SKIP_*`.
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
| `src/lib/MariaDB/**`, `lib/MongoDB/**`, `lib/PostgreSQL/*.mts` (top level only) | `docs/code/lib-datasource-errors.md` |
| `src/lib/PostgreSQL/{error,parse,pool,url,counter,tx,guard,role}/**` (kit subfolders, later parts add more) | `docs/code/lib-postgres.md` |
| `src/lib/Redis/**` + remaining `src/lib/` utilities | `docs/code/lib-utilities.md` |
| `src/private/**` | `docs/code/internal.md` |
| Any file added/removed/moved under `src/` | `REPO.md` |
| New file under `.github/` or new root doc (`SECURITY.md`, `CONTRIBUTING.md`, ...) | `REPO.md` |
| Major `version` bump | `SECURITY.md` supported-versions table |
| `.github/workflows/release.yml` | `.github/CLAUDE.md` (Release pipeline section) + `docs/verify-release.md` |
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
- No committing `yarn.lock` with `resolved` host ≠ `registry.npmjs.org`. No hand-fixing a mirror-flavoured copy — `REGISTRY_MIRROR=<mirror> yarn registry:canonical` handle it. No deleting or weakening the `.githooks/pre-commit` lockfile host check to silence it.
- No git clean/smudge filter on `yarn.lock`, no default mirror host in any script, no rewrite wired into `prepare` / `hooks:install`. The old `yarnlock-registry` filter hardcoded `yarnproxy.gio.lan` and `prepare` installed it on every clone → contributor `yarn.lock` smudged to a host they cannot reach. Mirror = opt-in via `REGISTRY_MIRROR` only.
- Never add a `preinstall`, `install` or `postinstall` script to `package.json`. This package is published to npm and the `scripts` block travels in the tarball, so an install-lifecycle script would execute on every consumer's machine, where dev dependencies such as `patch-package` do not exist; at best it fails the consumer's install, at worst it runs code the consumer did not expect. Dev-only setup goes in an explicit script (`yarn mutation` applies the Stryker patch itself) or in a CI step.
- No lowering `stryker.config.json` `thresholds.break`. Ratchet only up. No new Stryker `mutate` exclude to green a score. `// Stryker disable` only per *Mutation gate* in `.githooks/CLAUDE.md`.
- No `.ts` files — ext is `.mts`. Exceptions: `scripts/semgrep-canaries/**` (Semgrep fixtures), `test/property/*.spec.ts` (fast-check; Scorecard Fuzzing scan `*.ts` / `*.tsx` only, never `.mts`; knob `FC_NUM_RUNS`; comments stay caveman ultra; see `test/CLAUDE.md`). No `import x from './y'` — write `'./y.mjs'`.
- No `dependencies` in `package.json`. Zero runtime deps, all `peerDependencies` → consumer control versions. Every peer `optional` via `peerDependenciesMeta` (8.0.0, 0 hard; `uuid` dropped for `node:crypto` `randomUUID`). Live count + reach per peer: `test/__snapshots__/peer-reach.json`, pinned by `test/package/peerReach.spec.mts` → never copy numbers into prose.
- No breaking the optional-peer invariant. `optional` = claim about load path, not warning mute. True only while dep reachable solely through subpath consumer opt into by importing it. Two ways to break, both silent, both hit every consumer: add root `"."` key to `exports` (1 import drag whole graph in), or import an optional dep from a module every subpath reach. Need it on a common path → lazy `await import('pkg')`, like `src/private/files/_validateMimeType.mts` do for `file-type` (at call), or a private facade (top-level, via `src/private/lib/importOptional.mts`, no-op when absent): `@sentry/node` only through `src/private/lib/sentry.mts`, `dotenv` only through `src/private/lib/loadEnv.mts`. Never import either direct from a module (`PEER_SCOPE` in `peerReach.spec.mts` fails); facade top-level `await` safe only while every `exports` entry has just `import` + `types` conditions (`require()` of a subpath → `ERR_PACKAGE_PATH_NOT_EXPORTED`) → never add a `require` / `default` condition. `.d.mts` carry same boundary — `dataSources/PostgreSQL` types name `pg`, so `skipLibCheck: false` consumer of that subpath still need it installed.
- No new hard peer, no peer left out of `peerDependenciesMeta` (`peerReach.spec.mts` fails). Hard peer → npm 7+ / Yarn install it for every consumer → owner call, walk `exports` transitively over built `dist/` first (`peer-reach.json` is that walk). Never regen `peer-reach.json` to go green: read diff, every `runtime` entry of a peer must be a subpath whose purpose is that peer. Widest peer = `graphql` (dynamic `await import()` listed under `lazy`, not `runtime`). Count drift per release → read the snapshot, never copy it here.
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
- `yarn build:all` — ESM + CJS attempt. Broken: CJS half emit nothing (`include` match `*.ts`, all src `.mts`) → `find: dist/cjs` exit 1. Package ESM-only. Use `yarn build`.
- `yarn lint` — `eslint --fix` then `prettier --write 'src/**/*.mts' 'scripts/**/*.mts'`. Run after every multi-file edit.
- `yarn lint:check` — `eslint --max-warnings 0 --cache` then `prettier --check`. Read-only, no fix. Part of `check:static` → red CI = run `yarn lint`.
- `yarn check:static` — `caps` → `lint:check` → `typecheck` → `typecheck:scripts` → `typecheck:tests` → `knip` → `type-coverage` → `fta`. Single source: pre-commit, pre-push, CI step `Static gates` all call it. Run before report done.
- `yarn typecheck` (`tsconfig.check.json`, `exactOptionalPropertyTypes`) / `yarn typecheck:scripts` (`tsconfig.scripts.json`) / `yarn typecheck:tests` (`tsconfig.tests.json`, specs, same flags as `typecheck`) / `yarn knip` / `yarn type-coverage` / `yarn fta` (cap `fta.json` = 50, never raise) — 1 gate each.
- `yarn caps` — code-size ratchet vs `.code-caps-baseline.json`. `caps:update` only lower. `caps:report` list all.
- `yarn mutation` — `patch-package && stryker run`. Full run, ~13 min on 4 workers (last run: 1370 s on 2 workers), sandbox (tree untouched). Report `reports/mutation/index.html`. See *Mutation gate* in `.githooks/CLAUDE.md`.
- `yarn mutation:changed [base-ref]` — mutate only `src/**/*.mts` changed vs merge-base (default `origin/main`, else `HEAD~1`). Own incremental file, clear-text report only.
- `yarn leak:check` — heap tripwire on built `dist/` (`yarn build` first). CI weekly/dispatch only, advisory.
- Snapshots: `test/__snapshots__/*.json`. Regen `UPDATE_SNAPSHOT=1 yarn test`, only on intentional API change, read diff. See `test/CLAUDE.md`.
- `yarn clean` — wipe `dist/`.
- `yarn test` — `build` + `build:tests` + mocha. No coverage check.
- `yarn test:coverage` — same via c8, **fail below 100%** on any file. This command decide change finished. Feed Qodana coverage gate too.
- `yarn hooks:install` — set `core.hooksPath .githooks`. Idempotent, no-op outside git repo, run from `prepare`. Touch no `yarn.lock`.
- `yarn registry:mirror` / `registry:canonical` / `registry:check` — `node scripts/registry-rewrite.mjs mirror|canonical|check`. Need `REGISTRY_MIRROR=http://host:4873` except `check`. See *npm mirror* in `.githooks/CLAUDE.md`.
- `yarn reindex` — `node .gitnexus/run.cjs analyze --no-stats`.
- `yarn qodana` / `yarn qodana:cli` — `test:coverage` → Qodana scan → open report.
- `yarn upload` — `npm publish --registry=https://registry.npmjs.org/`. Flag load-bearing, see *npm mirror* in `.githooks/CLAUDE.md`. Owner ask only. Manual fallback path: no provenance, no release assets. Per version ONE path: `yarn upload` XOR `release.yml`. 2nd fail, version already on npm.

## Nested rules — moved out, read when touching the dir

Kept out of this file to keep it small. Read the file before acting in that area.

- `.github/CLAUDE.md` — CI workflows (pins, permissions, runner pool policy, Node pins), release pipeline `release.yml`, deprecating superseded versions.
- `.githooks/CLAUDE.md` — Qodana gate in `pre-commit`, *Mutation gate* (StrykerJS: survivors, `// Stryker disable`, `thresholds.break`), npm mirror + `yarn.lock` registry host rules.
- Hard stops stay here in *Never*: no `yarn upload` / `npm publish` / `npm deprecate` / `gh release` unasked, no `--no-verify` / `SKIP_QODANA`, no lowered threshold, never commit on `main`.

## PR flow — branch → PR → merge commit

- Work land via PR from the `<type>/<slug>` branch. Owner merge with merge commit: `gh pr merge <n> --merge`. Never squash, never rebase → Scorecard Maintained + Code-Review count branch commits + merge commit, squash collapse them.
- Agent push branch / `gh pr create` only when owner ask in that message. Merge stay owner call, see *Never*.
- When the main ruleset is enabled: direct push to `main` rejected, owner included → "merge branch then push `main`" habit stop working. Owner-only bypass `gh pr merge <n> --merge --admin`, after `Test coverage` green.
- Required check = `Test coverage` (job `name:` in `.github/workflows/ci.yml`). Rename job → update ruleset same change, else every PR block on a context nothing report.

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

- Maintainer: Giovanni Manzoni (`@giovannimanzoni`). CODEOWNERS = him + backup owner `@vivi7` (`CODEOWNERS` file). License GPL-3.0-or-later → any added file must be compatible.
- Conventional commits, enforced by `.githooks/commit-msg`.
- **Whole message ≤ 150 chars** (`MAX_LEN=150`), subject + body counted together. Hook hard-reject above. 1 number, 1 check — no separate subject cap, no body line count, no wrap width.
- **Allowed types exactly `feat|fix|chore|docs|refactor|ci`.** `test:`, `build:`, `perf:`, `style:` rejected, even though older commits used them. Scope optional (`feat(auth): ...`). Never widen hook to fit a message — pick a type that fit.
- **No `!` breaking marker.** `feat!: ...` fail regex. Signal breaking change in body.
- **Banned words anywhere in message: `Co-Authored-By`, `Claude`, `anthropic`, `Sonnet`, `Opus`** (case-insensitive). Hook reject. Never append AI attribution trailer in this repo, whatever default elsewhere.
- Match is substring, case-insensitive → a commit message can never name `CLAUDE.md`, `.claude/settings.json`, `scripts/caveman-claudemd-gate.sh`, nor a branch whose name carry those. Say "agent rule file" / "project settings file" / "gate script" instead, and rename the branch before merging — `Merge branch '...'` carry the branch name into the subject. Never widen hook to fit. Rule live here: a blocked message is a rewrite, not a hook edit.
- Merge + revert commits skip format check, still hit banned-word check.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **koa-utils**.

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis. For unified PDG impact, add `mode: "pdg"` with optional `line: <N>` — it returns statement-level `affectedStatements` over CDG + REACHING_DEF and inter-procedural symbols in `interproceduralByDepth`/`byDepth`; no-layer/degraded PDG results are UNKNOWN-risk notes (`--pdg` layer). CLI equivalent: `node .gitnexus/run.cjs impact "symbolName" --direction upstream --mode pdg --line <N> --repo .`.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).
- For control/data dependence, `pdg_query({mode: "controls", target: "fileOrSymbol"})` answers "under what condition does X run?" (CDG, incl. guard clauses) and `pdg_query({mode: "flows", target, variable})` traces "where does variable Y flow?" (REACHING_DEF). `--pdg` layer.

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/koa-utils/context` | Codebase overview, check index freshness |
| `gitnexus://repo/koa-utils/clusters` | All functional areas |
| `gitnexus://repo/koa-utils/processes` | All execution flows |
| `gitnexus://repo/koa-utils/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
