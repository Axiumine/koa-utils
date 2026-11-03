# .githooks — agent rules

Repo-wide rules in root `CLAUDE.md`. Editing this file → Rule 0 there first (caveman ultra via `caveman:caveman` skill; skill missing = blocked).

Scope: Qodana gate in `pre-commit`, mutation gate (StrykerJS, `pre-push`), npm proxy / `yarn.lock` registry host rules.

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

## npm mirror — `yarn.lock` stay public

Maintainer install via LAN Verdaccio (`http://yarnproxy.gio.lan:4873/`, gitignored `.yarnrc`). Yarn 1 write absolute tarball URLs → host leak into git → `yarn install` break for every off-LAN clone. Published tarball safe: `files: ["dist"]` keep lockfile out. Only clones break.

- Convention: committed `yarn.lock` = `https://registry.npmjs.org` always. Plain clone → plain `yarn install`, nothing to configure. Mirror = opt-in, only via env `REGISTRY_MIRROR`. Same scheme as expo-any-icon.
- `scripts/registry-rewrite.mjs mirror|canonical|check [lockfile]`, aliased `yarn registry:*`. `mirror`: canonical → `$REGISTRY_MIRROR`, before install. `canonical`: `$REGISTRY_MIRROR` → canonical, before commit. `check`: exit 1 if any registry tarball host ≠ canonical, no env needed. Only `resolved` registry tarball URLs rewritten; `integrity` untouched — Verdaccio serve byte-identical tarballs, only URL differ.
- Maintainer flow: `export REGISTRY_MIRROR=<mirror base URL>` → `yarn registry:mirror` → `yarn install` → `yarn registry:canonical` → `git add`. Mirror host live in maintainer env or local wrapper script, never in repo docs or scripts. Wrapper do `trap 'node scripts/registry-rewrite.mjs canonical' EXIT` → canonical restored even if install fail. Between mirror and canonical `git diff` show `yarn.lock` modified, by design.
- `.githooks/pre-commit` backstop: read `:yarn.lock` from index, block any `resolved` host ≠ `registry.npmjs.org`. Catch forgotten `registry:canonical`. Read index, not worktree → mirror-state worktree stay legal until staged. Keep pipe-free — `git show | grep -q` exit early → `git show` take SIGPIPE → `pipefail` turn pipeline falsy → check silently never fire.
- **`yarn upload` keep `--registry=https://registry.npmjs.org/`.** Yarn 1 export `.yarnrc` registry to child proc as `npm_config_registry` → bare `npm publish` run *through* yarn hit proxy. Shipped broken 5.0.0 → 5.0.2: `ENEEDAUTH` vs mirror, or worse, silent LAN publish npmjs never saw. npm precedence: CLI flag > env var. Work typed straight in shell only because that skip yarn. Verify `yarn upload --dry-run` → output must name `registry.npmjs.org`. Any `yarnproxy` host → flag lost.
- Yarn Berry 4.x fix natively (hostless `resolution: "pkg@npm:1.0.0"`, registry from `.yarnrc.yml`). Migration = real fix if repo ever leave Yarn 1.

## Mutation gate — StrykerJS

c8 100% prove lines ran, not that tests assert. Stryker mutate `src/**/*.mts`, rerun tests, survivor = missing assertion. Config `stryker.config.json`: runner `mocha`, checker `typescript`, `coverageAnalysis: perTest`, `incremental` (file `reports/stryker-incremental.json`), `inPlace: false` → sandbox copy in `.stryker-tmp/`, working tree never rewritten. Mutate set mirrors `.c8rc.json` excludes (`I[A-Z]*.mts`, `types/*`, `interfaces/**`, `TCommonHeaders`, `TCookieRefreshToken`, `checkForNSFW`). Build in sandbox: `scripts/mutation-build.sh` (clean + `build:esm` + `build:tests`; links `node_modules` itself because Stryker build run before link).

- Target = 100% of non-disabled mutants. `thresholds.break` = 100 (`high`/`low` too). Full run 2275 mutants → 0 survived, 0 no cov, 1743 killed + 36 timeout, 13 ignored (12 `// Stryker disable` comments in `src`, 1 hides 2 replacements; count: `grep -rn 'Stryker disable' src`), rest compile/runtime errors. Never lower. New `src` code → kill all its mutants, break fail otherwise.
- Survivor → new assertion in `test/`, never `thresholds` edit.
- Spec spawn subprocess → forward `globalThis.__stryker__.activeMutant` as env `__STRYKER_ACTIVE_MUTANT__`, else child run original code → mutant survive. Ref `setRedisLoginSession.mutation.spec.mts`.
- Disable hide every replacement of its mutator, no per-replacement form. Mixed equivalent + killable (`DateLib.timeDiffMin`) → reason name which replacement killable + which spec kill it (apply by hand, watch fail).
- `// Stryker disable next-line <Mutator>[,<Mutator>]: <reason>` (or block form `// Stryker disable <Mutator>: <reason>` … `// Stryker restore <Mutator>`) only for TRUE equivalent mutant: mutated program behave identical for every input. Reason must say why, verified (read diff, try to write killing test first). Banned reasons: "hard to test", "not worth", "covered elsewhere", "flaky". Unverified → write test. Stryker disable = allowed (owner decision) for true equivalents only. `/* c8 ignore */` still banned.
- Never run 2 Stryker runs or `yarn test` in same checkout concurrently (shared `dist/`, though sandbox isolate most). Shard = own worktree.
- `.stryker-tmp/` and `reports/` gitignored + listed in `qodana.yaml` `exclude` (generated HTML report = 1000+ High findings → blocks pre-commit Qodana). Output only, not a threshold change.
- mocha-runner 10.1.1 crash on Mocha 12 → `patches/@stryker-mutator+mocha-runner+10.1.1.patch` (`patch-package`, 1 file `lib-wrapper.js`). Applied by `yarn mutation` and `mutation.yml` step only (rule below), idempotent. Remove when upstream support Mocha 12 → steps in `TODO.md`. Patch bump of plugin → patch name/version stale → regenerate or drop.
- `patch-package` must never run from a `preinstall`, `install`, `postinstall` or `prepare` script in `package.json`. This package is published, so the `scripts` block travels in the tarball and such a script would run on every consumer machine, where `patch-package` is not installed and the install would fail. Only the `mutation` script and the `mutation.yml` step may apply the patch.
