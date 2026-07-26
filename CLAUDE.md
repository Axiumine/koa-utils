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
5. **Scope is `CLAUDE.md` only.** `README.md`, `REPO.md`, `docs/code/*.md`, `CHANGELOG.md` and every source comment stay normal prose — those are consumer-facing.
6. **This rule is machine-enforced, so step 1 is not optional.** Two `PreToolUse` hooks in `.claude/settings.json` run `scripts/caveman-claudemd-gate.sh`. The `Skill` matcher records that `caveman:caveman` was invoked in this session; the `Write|Edit` matcher denies any write whose target is named `CLAUDE.md` when either the skill is not installed or it has not been invoked. The gate fails closed — a prerequisite it cannot verify is a deny, never a warn-and-continue, same standing as the coverage and Qodana gates. The escape hatch is `SKIP_CAVEMAN_GATE=1`, owner only. Do not delete the hooks or the script to unblock a write; invoke the skill instead.

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
- `.githooks/pre-commit` run `yarn test:coverage` **then Qodana**, on every commit touching `src/`, `test/`, `package.json`, `.c8rc.json`, `.mocharc.json`, `tsconfig*.json`. Docs-only skip both. Wired by `yarn hooks:install` (via `prepare`) → `core.hooksPath .githooks`.
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
- No `.ts` files — ext is `.mts`. No `import x from './y'` — write `'./y.mjs'`.
- No `dependencies` in `package.json`. Zero runtime deps, all `peerDependencies` → consumer control versions.
- No `console.debug` in `src/`, no commented-out `console.*` left behind — owner cleared both in 5.6.0. `console.info` / `console.error` / `console.log` stay put (`src/dataSources/**`, `src/files/scanVirus.mts`, upload helpers): they carry conn + error reporting. Debug via breakpoint or temp local edit.
- No constant replacing `accessTokenExpiry()` 30–90 min jitter.
- No barrel `index.mts`, root or any subdir — exports per-file by design.
- No import from `src/private/**` outside package. No `private/*` in `package.json` `exports`.
- No `yarn upload` / `npm publish` / `npm deprecate` unless user explicitly ask. Outward-facing, consumer-visible, owner call.
- No destructive git (`reset --hard`, `clean -fd`, force-push) without confirmation.
- Mocha = runner. No swap.
- No lowering/deleting `.c8rc.json` thresholds or `qodana.yaml` `testCoverageThresholds` — contract, not default. No `.c8rc.json` exclude, no `/* c8 ignore */`, to green a red gate. Write test.
- No `git commit --no-verify`, no `SKIP_QODANA=1`, no suggesting either to user as fix. Owner emergency only — CI block anyway.
- No softening hook Qodana prereqs into warnings. No `docker pull` inside hook.
- No disable/delete/edit of `.githooks/pre-commit` or `.githooks/commit-msg` unasked. Widening allowed commit types to pass a message = same violation → rewrite message.
- No deleting the `PreToolUse` hooks in `.claude/settings.json` or `scripts/caveman-claudemd-gate.sh` to land a `CLAUDE.md` write. Blocked write → invoke the skill, not remove the gate. Rule 0 §6.

## Build / lint

- `yarn build` — prod ESM build (`yarn clean && yarn build:esm`). `tspc` (ts-patch) apply `typescript-transform-paths` → emitted `.mjs` carry relative imports.
- `yarn build:all` — ESM + CJS dual. Only when explicitly needed.
- `yarn lint` — `eslint --fix` then `prettier --write 'src/**/*.mts'`. Run after every multi-file edit.
- `yarn clean` — wipe `dist/`.
- `yarn test` — `build` + `build:tests` + mocha. No coverage check.
- `yarn test:coverage` — same via c8, **fail below 100%** on any file. This command decide change finished. Feed Qodana coverage gate too.
- `yarn hooks:install` — set `core.hooksPath .githooks` **and** install lockfile registry filter. Idempotent, no-op outside git repo, run from `prepare`.
- `yarn reindex` — `node .gitnexus/run.cjs analyze --no-stats`.
- `yarn qodana` / `yarn qodana:cli` — `test:coverage` → Qodana scan → open report.
- `yarn upload` — `npm publish --registry=https://registry.npmjs.org/`. Flag load-bearing, see below. Owner ask only.

## npm proxy — `yarn.lock` stay public

Maintainer install via LAN Verdaccio (`http://yarnproxy.gio.lan:4873/`, gitignored `.yarnrc`). Yarn 1 write absolute tarball URLs → host leak into git → `yarn install` break for every off-LAN clone. Published tarball safe: `files: ["dist"]` keep lockfile out. Only clones break.

- Filter `yarnlock-registry` handle both directions: `clean` (worktree → git: `add`, `diff`, `status`) proxy → `registry.npmjs.org`; `smudge` (git → worktree: `checkout`, `clone`, `pull`) reverse. `.gitattributes` bind `yarn.lock`. Definition live in `.git/config` → other clones fall through, get public URLs.
- `scripts/lockfile-registry-filter.sh clean|smudge|install|uninstall`. `install` wire git config **and** reconcile current checkout — git never re-smudge a file it think up to date. Run from `hooks:install`. Per-machine override: `YARN_PROXY_REGISTRY=http://other:4873/`.
- `clean` run for `git diff` / `git status` too → host diff never show as modification. Lockfile look clean while worktree hold proxy URLs. `integrity` untouched — Verdaccio serve byte-identical tarballs, only URL differ.
- `.githooks/pre-commit` backstop: read `:yarn.lock` from index, block any `resolved` host ≠ `registry.npmjs.org`. Catch clones where filter never configured. Keep pipe-free — `git show | grep -q` exit early → `git show` take SIGPIPE → `pipefail` turn pipeline falsy → check silently never fire.
- **`yarn upload` keep `--registry=https://registry.npmjs.org/`.** Yarn 1 export `.yarnrc` registry to child proc as `npm_config_registry` → bare `npm publish` run *through* yarn hit proxy. Shipped broken 5.0.0 → 5.0.2: `ENEEDAUTH` vs mirror, or worse, silent LAN publish npmjs never saw. npm precedence: CLI flag > env var. Work typed straight in shell only because that skip yarn. Verify `yarn upload --dry-run` → output must name `registry.npmjs.org`. Any `yarnproxy` host → flag lost.
- Yarn Berry 4.x fix natively (hostless `resolution: "pkg@npm:1.0.0"`, registry from `.yarnrc.yml`). Migration = real fix if repo ever leave Yarn 1.

## Qodana — gate before publish, not after

`.githooks/pre-commit` block **the commit**, on anything touching `src/`, `test/`, `package.json`, `.c8rc.json`, `.mocharc.json`, `tsconfig*.json`. `.github/workflows/qodana.yml` (push/PR to `main`, manual dispatch) block **nothing** → report after the fact. CI alone not a gate here: `yarn upload` = local manual step, run beside CI not behind it. 5.6.0 published, CI red ~3 min later, broken tarball already public. Gate values in `qodana.yaml`, both places read it: `severityThresholds` critical 0 / high 0, `testCoverageThresholds` fresh 100 / total 100.

- Hook run docker direct, not `yarn qodana` — that script re-run `test:coverage` hook already did. Reuse report c8 just wrote.
- **Never pull inside hook.** Auto-pull broke 5.6.1 CI: Docker Hub timeout → `qodana-action` fell to `--skip-pull` → container never started → failure carried no verdict, 156-byte empty report. Pulling hook inherit that flake → network blip = failed commit.
- **Never skip.** Gate that step aside when it cannot run is not a gate. Every prereq — docker in `PATH`, daemon reachable, `qodana.yaml` present with `linter:` tag, `.env` present with `QODANA_TOKEN`, image already local — block commit, print the one fixing command, exit 1. Missing image → print `docker pull <linter>`, stop. Never warn-and-continue. Fail-open was this hook's first shape and it was wrong: single CODEOWNER, gate exist to run before publish.
- Linter tag read from `qodana.yaml` at run time, never hard-coded → bumping `linter:` must not leave hook scanning older image than CI.
- `QODANA_TOKEN` from `.env` via `--env-file`. Qodana 2023.2+ refuse to start without it.
- No `--show-report` in hook — serve on a port → hang the commit.
- Escape hatch `SKIP_QODANA=1 git commit`, narrower than `--no-verify` (keep coverage + lockfile gates). Owner only.
- Exit code cover infra failure as well as findings. Red hook + empty report = infra, not finding. Check `.qodana/results/report/index.html` before believing block.
- CI: `gh run list --workflow=qodana.yml` → `gh run view <id> --log-failed`. Red ≠ finding. Look for `can't pull image` / `couldn't create the container` first → `gh run rerun <id> --failed`.

## Deprecating superseded versions

Broken version stay installable forever via exact pin or stale lockfile. Semver range carry nobody forward — `^5.0.0` only help consumers who re-resolve. `npm deprecate` = only channel reaching a pinned install. **Bump `version` for a fix → ask whether superseded version need deprecating. Raise with owner before publishing.**

- Deprecate on real defect: auth bypass, enumeration oracle, data corruption, swallowed error, wrong HTTP status, broken artefact. Rule of thumb — anything earning `### Security` or `### Fixed` in `CHANGELOG.md` that change observable behaviour.
- **Never blanket-deprecate merely-old versions.** Deprecation mean "this version bad", not "not newest". Blanket → consumers ignore warning, and it fire in CI for every lockfile pin — exactly the audience needing the signal for a real defect. `5.4.0`, `5.4.1`, `5.5.0` stay undeprecated on purpose: superseded, nothing known wrong.
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
