# Contributing to @axiumine/koa-utils

Thanks for helping. This page tells you how to report a problem, set up a working copy, and what a pull request has to satisfy before it can be merged. Everyone taking part is bound by the [Code of Conduct](CODE_OF_CONDUCT.md). How decisions are made is in [GOVERNANCE.md](GOVERNANCE.md).

## Reporting problems and asking for features

- **Bugs and feature requests:** open an issue at <https://github.com/Axiumine/koa-utils/issues>. Say which version you run, your Node.js version, what you expected, what happened, and the smallest code that shows it.
- **Security problems:** do not open a public issue. Follow [SECURITY.md](SECURITY.md).
- **Anything bigger than a small fix:** open an issue first so the direction can be agreed before you spend time on code. [ROADMAP.md](ROADMAP.md) lists what the project will and will not do.

## Set up a working copy

You need Node.js `^24.14.0` and Yarn 1.

```bash
git clone https://github.com/Axiumine/koa-utils.git
cd koa-utils
yarn install --ignore-scripts   # dev dependencies only; maintainers run plain `yarn install` (wires the git hooks, builds dist/)
yarn test             # build + tests, no coverage gate
yarn test:coverage    # the gate a pull request must pass: 100% on every file
yarn lint:check       # ESLint (zero warnings allowed) + Prettier, no changes written
yarn check:static     # every static gate: caps, lint, typecheck (src, scripts, specs), Knip, type-coverage, FTA
```

`yarn lint` runs the same tools and rewrites files to fix what they can. [REPO.md](REPO.md) is the map of the source tree and the build scripts.

`yarn install` points `core.hooksPath` at `.githooks`. Three hooks run there:

- **`commit-msg`** checks the commit message format (see [Commit messages](#commit-messages)).
- **`pre-commit`** blocks a commit that touches code, tests, scripts or build config (`src/`, `test/`, `scripts/`, `package.json`, `.c8rc.json`, `.mocharc.json`, `tsconfig*.json`, `eslint.config.js`, `eslint-suppressions.json`, `knip.config.js`, `fta.json`, `.code-caps-baseline.json`). In order: the `yarn.lock` registry check, `yarn check:static`, `yarn test:coverage`, then a Qodana scan that needs Docker and a token only the maintainer holds. A docs-only commit skips all of it except the lockfile check.
- **`pre-push`** runs `yarn check:static` again (it catches commits made with `--no-verify`), then `yarn ratchet:against` on the merge base with `origin/main`, then the Semgrep scan and the Semgrep canaries (`scripts/semgrep.sh`, `scripts/semgrep-canary.sh`) in Docker. Last it mutation-tests the `src` files the push changes (see *Mutation testing*). It skips branch deletes and pushes that only change docs; a change to `.semgrep/` or `.github/workflows/semgrep.yml` counts as code here. It never pulls an image and needs no network (the Semgrep scripts pass `--disable-version-check`, and the registry packs are CI only): if the Semgrep image pinned in `.github/workflows/semgrep.yml` is not local, it stops and prints the `docker pull` command.

Outside contributors do not need the hooks: install with `yarn install --ignore-scripts`, then run `yarn check:static` and `yarn test:coverage` yourself before you push. On your pull request CI runs the `Test coverage` job (the `Static gates` step, the 100% coverage gate, a deterministic-build check) and the Semgrep scan, plus the advisory Trivy and weekly leak-check jobs. The Qodana job needs a repository secret that pull requests from forks do not receive, so it may fail on a fork; the maintainer runs the full local gate, Qodana included, before merging.

## Requirements for acceptable contributions

A pull request is acceptable when all of these hold.

1. **It fits the scope.** It does not collide with the "Will not do" list in [ROADMAP.md](ROADMAP.md).
2. **It follows the coding standard** below, and `yarn lint:check` passes.
3. **It comes with tests.** See [Tests](#tests).
4. **It updates the documentation** in the same pull request. See [Documentation](#documentation).
5. **It keeps the package contract:**
   - Source is `.mts` under `src/`. Never edit `dist/`.
   - No `dependencies` in `package.json`. Libraries are `peerDependencies`; a peer range has an upper bound and no floor (`keygrip` keeps its own `^1.1.0`).
   - A new public symbol is one file with one named export plus a matching `exports` entry in `package.json`. There is no barrel `index.mts`.
   - Nothing from `src/private/**` is exported.
   - An optional peer is imported only from the subpath that needs it, or lazily with `await import()`.
   - Passwords go through `encryptPassword` and `compareHashAsync`, never straight to `@node-rs/bcrypt`. A resolver that takes an email or password normalises the email and calls `checkEmailLen` and `checkPwdLen` first.
   - The security invariants in [docs/security.md](docs/security.md) hold. In particular, `account.email.hash` and `account.resetHash` are never interchangeable.
6. **Its commits are well formed.** See [Commit messages](#commit-messages).
7. **It is one logical change.** Do not reformat lines you did not change.

### Coding standards

- **Language:** TypeScript, ES modules, compiled with `tsc` in `strict` mode (`tsconfig.json`).
- **File layout:** `.mts` files; relative and aliased imports end in `.mjs` (NodeNext). Aliases are `@lib/*`, `@throw/*`, `@models/*`, `@context/*`, `@stypes/*`, `@private/*`, `@email/*`, `@dataSources/*`.
- **Formatting:** [Prettier](https://prettier.io) with the repository's `.prettierrc` (no semicolons, single quotes, no trailing commas, print width 129) and tabs as set in `.editorconfig`.
- **Linting:** [ESLint](https://eslint.org) with [`@axiumine/eslint-config-be`](https://www.npmjs.com/package/@axiumine/eslint-config-be), typed `strictTypeChecked` rules, `sonarjs` and `security` on `src/`, plus the size and complexity budget in `eslint.config.js` (`max-lines` 300, `max-lines-per-function` 50, `max-params` 4, `max-depth` 3, `complexity` 10). All of them are errors and `lint:check` runs with `--max-warnings 0`. The typed-lint debt that predates the rules sits in `eslint-suppressions.json`; a new violation fails, an old one cannot grow.
- **Static gates:** `yarn check:static` chains `caps`, `lint:check`, `typecheck` (`src/`, `exactOptionalPropertyTypes`), `typecheck:scripts`, `typecheck:tests` (the spec suite, same strict flags), `knip` (unused files, exports and dependencies), `type-coverage` (at least 99.5 non-strict, 96.7 strict) and `fta` (maintainability score cap in `fta.json`). Hooks and CI call this one script, so they cannot disagree. Run one gate alone with its own script, for example `yarn knip`.
- **Naming:** `IFoo` for interfaces, `TFoo` for type aliases, `FooType` for `GraphQLObjectType`s, `throwFoo` for error throwers, `handleIfFoo` for guard predicates. One named export per file, and the file is named after it.
- **Errors:** resolver and mutation logic does not throw a bare `Error`; it goes through a `throw*Error()` helper from `src/graphQL/throw/`, so the HTTP status and title stay stable. The upload helpers and a few internal guards still throw plain `Error`s; do not add new ones to resolvers.
- **Exceptions to the rules** are allowed but rare, and are written in the code at the place they apply (an inline `eslint-disable` or `nosemgrep` comment with a reason).

`yarn check:static` (which includes `yarn lint:check`) runs on every push and pull request in CI.

#### Ratchets: baselines and suppressions only shrink

Two files record debt that existed before a gate was added. Both are ratchets: they may go down, never up. `yarn ratchet:against [ref]` (default `origin/main`) enforces it: it compares both files with the version in `<ref>` and fails on any new key or higher value; lower values and removed keys pass. CI runs it on every pull request, and `pre-push` runs it against the merge base with `origin/main` (run `git fetch origin main` first if it stops on a missing ref).

- **`.code-caps-baseline.json`** lists the code-size violations that exist today (code lines only; caps: file 500, function 50, class 300, parameters 4, nesting 4). `yarn caps` fails on a new violation, on a grown one, and on a stale entry whose violation is gone. After you shrink or fix one, run `yarn caps:update`: it only lowers values and removes entries, it never raises a value or adds an entry. `yarn caps:report` lists every violation. Never raise a value in this file; split the code instead.
- **`eslint-suppressions.json`** is ESLint's bulk-suppression file. Do not edit it by hand. After you fix suppressed violations, run `npx eslint --prune-suppressions` to drop the entries that no longer apply. Only the maintainer adds suppressions (`npx eslint --suppress-all`), for a rule the maintainer decides to adopt with existing debt.
- **Other bars** (`type-coverage` thresholds in the `package.json` scripts, the `fta.json` score cap, the cap limits, the strict `tsconfig` flags) are never lowered or raised to make a change pass. Fix the code.
- `typescript-eslint` and the `@typescript-eslint/*` packages must be bumped together, to the same version.

#### Snapshots

`test/__snapshots__/public-api.json` pins the public surface (the `exports` map against `dist/`, and the runtime symbol names of every export) and `test/__snapshots__/graphql-errors.json` pins every GraphQL error (status, title, description). A failing snapshot spec means the public API or an observable error changed. Read the diff first. If the change is intended, regenerate with `UPDATE_SNAPSHOT=1 yarn test`, commit the snapshot with the code, and say in the pull request that the API changed: a removed key or symbol is breaking, an added one is additive, and a changed error title, status or description must be reflected in `docs/code/graphql-errors.md` in the same pull request. Never regenerate just to go green.

### Tests

**Policy:** every new feature and every change to behaviour in `src/` must be accompanied, in the same pull request, by automated tests in `test/` that exercise it. A bug fix must include a regression test that fails without the fix.

- Tests use Mocha, Chai and Sinon. `test/` mirrors the layout of `src/`, so `src/lib/foo.mts` is tested in `test/lib/foo.spec.mts`. Property-based specs (fast-check) for the input guards live in `test/property/` and are `.ts` files.
- Coverage is measured by c8 and enforced per file at 100% for lines, statements, functions and branches (`.c8rc.json`). Every `if` and `else`, every `??`, `?.` and `||` fallback, every `catch` and every early return needs a test. `yarn test:coverage` must pass.
- Do not lower a threshold, add an exclude or add a `c8 ignore` comment to make the gate pass. Write the test.

### Mutation testing

100% coverage shows that every line ran, not that a test would notice if the line were wrong. [StrykerJS](https://stryker-mutator.io) closes that gap: it changes the code one small step at a time (flips `<` to `<=`, empties a string, removes a call) and reruns the tests. A mutant a test catches is *killed*; one that no test catches *survived*, which means an assertion is missing.

- `yarn mutation` runs every mutant over `src/**/*.mts` (about 13 minutes on 4 workers; the last full run took 1370 s on 2 workers: 2275 mutants, 1743 killed, 36 timeouts, 13 ignored by 12 disable comments, 483 compile or runtime errors, 0 survivors). It works on a copy in `.stryker-tmp/`, so your working tree is never touched, and it applies the Mocha 12 patch from `patches/` itself (see `TODO.md`). That patch is applied only by the mutation scripts and the mutation workflow, never by an install lifecycle script, because the package is published and such a script would run on every consumer machine. `yarn mutation:changed` mutates only the files you changed against `origin/main` (add a ref as argument to compare with another one); use it while you write tests. Do not run either while another build or test run uses the same checkout.
- **Reading the report.** Open `reports/mutation/index.html`: red lines hold survivors, click a mutant to see the replaced code and the tests that ran against it. The terminal table shows, per file, killed, timeout (counts as killed), survived, `no cov` (no test reaches the mutant, so write one) and errors (the mutant does not compile, ignored). The score is killed plus timeout over all valid mutants, leaving out the mutants that carry a Stryker disable comment (reported as *ignored*). `thresholds.break` in `stryker.config.json` is 100: any survivor or uncovered mutant fails the run. The last full run: 2275 mutants, 0 survived, 0 without coverage, 12 Stryker disable comments in `src` (`grep -rn 'Stryker disable' src` lists them). The floor never goes down.
- **Fixing a survivor.** Add an assertion that fails on the mutated code and passes on the real code, then rerun `yarn mutation:changed`. A test that merely executes the line does not count.
- **Disabling a mutant.** Only a *true equivalent mutant* may be disabled: one whose mutated program behaves identically for every possible input, so no test could ever tell them apart. Use `// Stryker disable next-line <Mutator>: <reason>` on the line above, or the block form `// Stryker disable <Mutator>: <reason>` ... `// Stryker restore <Mutator>`, and name the mutator. The reason must say why the mutant is equivalent, and you must have read the mutated code and tried to write a killing test first. "Hard to test", "not worth it", "covered elsewhere" and "flaky" are not reasons: write the test. A disable hides every replacement of its mutator, so when only one replacement is equivalent (`DateLib.timeDiffMin`: `>=` is equivalent, `<=` is not) the reason must name the killable one and the specs that fail when you apply it by hand. A spec that spawns a subprocess must forward `globalThis.__stryker__.activeMutant` as the environment variable `__STRYKER_ACTIVE_MUTANT__`, otherwise the child runs the original code and the mutant survives. Never disable to raise the score, never lower `thresholds.break`, never add a path to `stryker.config.json` `mutate` exclusions to hide a file.
- `.githooks/pre-push` runs `yarn mutation:changed` on the `src` files your push changes, after the static and Semgrep gates (roughly 2 to 3 minutes for 3 or 4 files, longer for more). A score under `thresholds.break` blocks the push (the floor is 100, so every mutant in the changed files must be killed). `git push --no-verify` is the owner-only escape hatch.
- CI runs the full mutation run every week (Sundays) and on demand (`.github/workflows/mutation.yml`), reuses the previous results to stay fast and is advisory: it is not a required check.

### Documentation

Documentation is hand-written and is part of the change, not a follow-up. When you change code, update the page that describes it in the same pull request:

| You changed | Update |
|---|---|
| `src/dataSources/**` | `docs/code/data-sources.md` |
| `src/email/**` | `docs/code/email.md` |
| `src/files/**` | `docs/code/files.md` and `src/files/Readme.md` |
| `src/graphQL/models/**` | `docs/code/graphql-models.md` |
| `src/graphQL/schema/**` | the matching `docs/code/graphql-*.md` page |
| `src/graphQL/throw/**`, `src/graphQL/status.mts` | `docs/code/graphql-errors.md` |
| `src/koa/**` | `docs/code/koa-core.md` or `docs/code/koa-middleware.md` |
| `src/lib/**` | `docs/code/lib-*.md` |
| `src/private/**` | `docs/code/internal.md` |
| A file added, removed or moved under `src/` | `REPO.md` |
| Public API, install steps, `engines`, usage examples | `README.md` |
| A user-visible change | Describe it in the pull request; the maintainer writes the `CHANGELOG.md` entry when the version is bumped |
| `version` in `package.json` (maintainer) | the "Current version" line in `docs/code/README.md`, and on a major bump the supported-versions table in `SECURITY.md` |
| Trust boundaries, crypto, validation, hardening | `docs/security.md` |

A documented snippet that no longer compiles against the real signature is worse than no snippet.

### Commit messages

[Conventional Commits](https://www.conventionalcommits.org): `type(scope): subject`. The types are `feat`, `fix`, `chore`, `docs`, `refactor` and `ci`. There is no `!` marker: describe a breaking change in the body. The whole message, subject and body together, is at most 150 characters, and the `commit-msg` hook rejects longer ones.

## Review and merge

The maintainer reviews every pull request and merges it when the requirements above are met. Review feedback is given on the pull request. See [GOVERNANCE.md](GOVERNANCE.md) for how disagreements are settled.

## Releases

Only the maintainer bumps `version`, tags and publishes. Do not change `version` in a pull request.

## License

By contributing you agree that your contribution is licensed under GPL-3.0-or-later, the project's license (`LICENSE`).
