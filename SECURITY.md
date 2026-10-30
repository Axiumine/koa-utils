# Security Policy

`@axiumine/koa-utils` ships authentication, password-reset, email-verification and file-upload helpers, so a security
defect here can reach every service that uses it. Reports are taken seriously and handled privately until a fix is
published.

## Supported versions

Only the latest major line receives fixes. A fix ships as a new release; it is not backported.

| Version | Supported |
| --- | --- |
| 7.x | Yes. Upgrade to the newest 7.x release. |
| 6.x | No. Upgrade to 7.x; the only breaking change in 7.0.0 is the `uploadTempImage` export rename. |
| 5.9.x and older | No. Known vulnerable and marked deprecated on npm. Upgrade to 7.x. |

Every published version that carried a real defect is marked deprecated on npm with a message that names the defect
and the version that fixes it. [CHANGELOG.md](CHANGELOG.md) is the record: look for the `### Security` and `### Fixed`
entries.

## Reporting a vulnerability

Do not open a public issue, pull request or discussion for a suspected vulnerability.

Use either private channel:

1. **GitHub private vulnerability reporting (preferred):**
   <https://github.com/Axiumine/koa-utils/security/advisories/new>
   <!-- OWNER: private vulnerability reporting is not enabled on the repository yet (the GitHub API answers enabled:false). Enable it before this file is merged (Settings, Code security, Private vulnerability reporting), or delete option 1 and the "preferred" wording. -->
2. **Email:** dev@giovannimanzoni.com, with `koa-utils security` in the subject.

Please include:

- the affected version(s) and the Node.js version;
- what an attacker can do and under which conditions (unauthenticated, authenticated, specific configuration);
- a minimal reproduction or proof of concept;
- a suggested fix, if you have one.

Do not include real credentials or personal data in the report.

## What to expect

This project has a single maintainer, so the timelines below are targets, not contractual guarantees.

| Step | Target |
| --- | --- |
| Acknowledgement of your report | within 7 days |
| Assessment: confirmed or not, severity, affected versions | within 14 days of the report |
| Fix released for a confirmed vulnerability of medium severity or higher | within 60 days of the report |
| Fix released for a critical vulnerability | within 30 days of the report |

If a report is declined you receive the reasoning. If a fix will take longer than the target you receive a status
update before the target date.

## Coordinated disclosure

- The vulnerability stays private until a fixed release is on npm.
- On release the maintainer publishes a GitHub Security Advisory (with a CVE requested for confirmed issues), adds a
  `### Security` entry to [CHANGELOG.md](CHANGELOG.md), and runs `npm deprecate` on the affected versions.
- Reporters are credited in the advisory and the changelog unless they ask to stay anonymous.
- If no fix is published within 90 days of the report, the reporter is free to disclose publicly.

## Dependencies

The package ships no runtime `dependencies`; every library it uses is a peer dependency that the consumer installs and keeps up to date. The development tree is monitored by Dependabot (`.github/dependabot.yml`), a weekly `yarn audit` run in CI and the Semgrep and Qodana scans. A finding is fixed by upgrading, or is recorded in an issue with the reason it cannot be exploited through this package.

## Verifying a release

Release tags from `v5.0.0` on are SSH-signed, and the npm tarball of a release can be rebuilt from its tag. Releases published through the GitHub Actions release workflow also carry a build attestation. The steps are in [docs/verify-release.md](docs/verify-release.md).

## Scope

In scope: the code in this repository and the package published to npm as `@axiumine/koa-utils`, including the
authentication and refresh-token flow, the reset-password and verify-email factories, the GraphQL error helpers, the
data-source connectors and the file-upload pipeline.

Out of scope:

- Vulnerabilities in third-party packages. This package has no runtime `dependencies`; every runtime package is a peer
  dependency that your project installs, so such a defect is fixed by upgrading it in your own project. Report it to
  that package. If a peer range here stops you from installing a fixed upstream release, that is a bug in this package
  and is in scope.
- Findings that require an attacker to already control the host, the Redis or database server, or the consumer's
  environment variables.
- Misconfiguration in a consuming application.
