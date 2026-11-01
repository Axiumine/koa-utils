# Governance

`@axiumine/koa-utils` is a single-maintainer project under the Axiumine GitHub organization. This page says how decisions are made, who holds which role, and how the project keeps going if the maintainer cannot.

## How decisions are made

The project uses a maintainer-led model: the maintainer makes the final call on scope, design, merging and releasing.

- Day-to-day changes are decided in the pull request or issue where they are proposed. The maintainer merges when the [contribution requirements](CONTRIBUTING.md#requirements-for-acceptable-contributions) are met.
- Larger or breaking changes start as an issue. Breaking changes ship only in a major version and are recorded in [CHANGELOG.md](CHANGELOG.md) (a `### Breaking` section).
- The direction for the next year is in [ROADMAP.md](ROADMAP.md). Items there are intentions, not promises.
- A disagreement is settled by the maintainer after the discussion on the issue. The reasoning is written on that issue. The license (GPL-3.0-or-later) lets anyone fork the project, so a disagreement the maintainer settles against you never locks you out.
- Conduct problems follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Roles and responsibilities

| Role | Who | Responsibilities |
|---|---|---|
| Maintainer | Giovanni Manzoni ([@giovannimanzoni](https://github.com/giovannimanzoni)) | Triage issues and pull requests. Review and merge. Decide scope and breaking changes. Cut, sign and publish releases. Run the vulnerability response in [SECURITY.md](SECURITY.md). Decide when a superseded version is deprecated on npm. Enforce the Code of Conduct. Keep the documentation in step with the code. |
| Backup owner | [@vivi7](https://github.com/vivi7), second owner of the Axiumine GitHub organization | Can administer the repository and organization, merge, tag, and (see [Continuity](#continuity)) publish a release if the maintainer cannot. Receives Code of Conduct reports about the maintainer. Acts only when the maintainer is unreachable. Has agreed to the role (2026-11-01). |
| Contributor | Anyone who opens an issue or pull request | Follow [CONTRIBUTING.md](CONTRIBUTING.md) and the Code of Conduct. |
| Security reporter | Anyone who reports a vulnerability | Report privately as described in [SECURITY.md](SECURITY.md). Is credited unless they ask not to be. |

`CODEOWNERS` lists the maintainer as owner of every path.

## Continuity

The project must be able to continue, with minimal interruption, if the maintainer dies, is incapacitated, or is unwilling or unable to continue. A second person must be able to create and close issues, accept changes and release a version within a week of the loss being confirmed.

| Capability | Held by | How a successor uses it |
|---|---|---|
| Create and close issues, merge pull requests, push tags, change repository settings | The maintainer, and the second owner of the Axiumine GitHub organization (the organization has two owners and requires two-factor authentication) | Sign in to GitHub as an organization owner. No credential of the maintainer is needed. |
| Publish to npm as `@axiumine/koa-utils` | The maintainer's npm account, and the GitHub Actions release workflow (`.github/workflows/release.yml`, npm trusted publishing with provenance, no stored token), which a repository admin starts by publishing a GitHub release | Publish a GitHub release for a signed tag on `main`, then approve the `npm-publish` deployment. The required reviewers of that environment are the maintainer and the backup owner, so either can approve. `npm publish` from a tagged checkout (`yarn upload`) stays available to the maintainer's npm account. |
| Sign release tags | Maintainer's SSH signing key | A successor signs with their own key and records its fingerprint in [docs/verify-release.md](docs/verify-release.md) in the same commit as the first tag they sign. Old tags stay verifiable with the old key. |
| Quality gates | Repository files and GitHub Actions | Tests, 100% coverage, ESLint, Prettier and Semgrep run in CI from files in the repository. The local pre-commit Qodana step needs a Qodana token (`QODANA_TOKEN` in `.env`, see `.env.example`); a successor creates their own in their Qodana Cloud account. |
| Legal rights | License | GPL-3.0-or-later. Copyright stays with the contributors. Anyone may continue the project as a fork under the same license, with no assignment needed. |

**Known gap.** The npm package settings (the trusted publisher binding and the list of package maintainers) are changed on npmjs.com by the npm account that holds that right, today the maintainer's. A successor can still release through the workflow without touching npm, because the trusted publisher is bound to this repository's workflow, not to a person. A second npm maintainer would close the rest of the gap.

Steps for a successor, in order:

1. Sign in to GitHub as an owner of the `Axiumine` organization. Confirm the loss of the maintainer in an issue so the record is public.
2. Read [REPO.md](REPO.md) section 7 (versioning and release) and [CLAUDE.md](CLAUDE.md) (the repository rules).
3. Triage open issues. Merge pending pull requests that meet [CONTRIBUTING.md](CONTRIBUTING.md).
4. To release: bump `version` in `package.json`, update `CHANGELOG.md` and the "Current version" line in `docs/code/README.md`, tag with a signed tag, then publish a GitHub release for it and approve the `npm-publish` deployment (see the table above).
5. To publish a fix for a vulnerability, follow the response process in [SECURITY.md](SECURITY.md#what-to-expect) and its [coordinated disclosure](SECURITY.md#coordinated-disclosure) rules.

## Bus factor

The bus factor is 1: every commit so far has the same author (`git shortlog` shows one name). The measures that limit the damage are the 100% per-file test coverage gate, the same-commit documentation rule, the written release procedure in `REPO.md`, the backup owner (the second owner of the GitHub organization and a required reviewer of the `npm-publish` environment), and the open license. The remaining gap is the single npm account described above. Taking on a co-maintainer is listed in [ROADMAP.md](ROADMAP.md). The OpenSSF Best Practices criterion `bus_factor` (a SHOULD at silver level) is therefore not met, and this paragraph is the justification.
