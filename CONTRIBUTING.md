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
yarn lint:check       # ESLint + Prettier, no changes written
```

`yarn lint` runs the same tools and rewrites files to fix what they can. [REPO.md](REPO.md) is the map of the source tree and the build scripts.

`yarn install` points `core.hooksPath` at `.githooks`, and the pre-commit hook there runs `yarn test:coverage` and then a Qodana scan that needs Docker and a token only the maintainer holds. Outside contributors do not need the hooks: install with `yarn install --ignore-scripts`, then run `yarn test:coverage` and `yarn lint:check` yourself before you push. On your pull request CI runs the `Test coverage` job (lint, the 100% coverage gate, a deterministic-build check) and the Semgrep scan. The Qodana job needs a repository secret that pull requests from forks do not receive, so it may fail on a fork; the maintainer runs the full local gate, Qodana included, before merging.

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
- **Linting:** [ESLint](https://eslint.org) with [`@axiumine/eslint-config-be`](https://www.npmjs.com/package/@axiumine/eslint-config-be) plus the size and complexity budget in `eslint.config.js` (`max-lines` 300, `max-lines-per-function` 50, `max-params` 4, `max-depth` 3, `complexity` 10). The budget rules are warnings: they do not fail the run, but a new warning needs a reason.
- **Naming:** `IFoo` for interfaces, `TFoo` for type aliases, `FooType` for `GraphQLObjectType`s, `throwFoo` for error throwers, `handleIfFoo` for guard predicates. One named export per file, and the file is named after it.
- **Errors:** resolver and mutation logic does not throw a bare `Error`; it goes through a `throw*Error()` helper from `src/graphQL/throw/`, so the HTTP status and title stay stable. The upload helpers and a few internal guards still throw plain `Error`s; do not add new ones to resolvers.
- **Exceptions to the rules** are allowed but rare, and are written in the code at the place they apply (an inline `eslint-disable` or `nosemgrep` comment with a reason).

`yarn lint:check` runs ESLint and Prettier and runs on every push and pull request in CI.

### Tests

**Policy:** every new feature and every change to behaviour in `src/` must be accompanied, in the same pull request, by automated tests in `test/` that exercise it. A bug fix must include a regression test that fails without the fix.

- Tests use Mocha, Chai and Sinon. `test/` mirrors the layout of `src/`, so `src/lib/foo.mts` is tested in `test/lib/foo.spec.mts`. Property-based specs (fast-check) for the input guards live in `test/property/` and are `.ts` files.
- Coverage is measured by c8 and enforced per file at 100% for lines, statements, functions and branches (`.c8rc.json`). Every `if` and `else`, every `??`, `?.` and `||` fallback, every `catch` and every early return needs a test. `yarn test:coverage` must pass.
- Do not lower a threshold, add an exclude or add a `c8 ignore` comment to make the gate pass. Write the test.

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
