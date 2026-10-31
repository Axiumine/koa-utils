# Roadmap

What `@axiumine/koa-utils` intends to do, and not do, from November 2026 to the end of 2027. It is a statement of direction, not a commitment: dates move, and security fixes jump the queue. Last reviewed 2026-10-30; the maintainer revisits it at every minor release.

## What the project is for

A TypeScript utility library for Koa + GraphQL backends: authentication flows and middleware, GraphQL error helpers, data-source connectors, a file-upload pipeline and transactional email. It ships ESM only, with zero runtime `dependencies`; every library it needs is a peer dependency the consumer installs.

## Will do

### Runtime and peer support

- **Node.js 26.** Node 26 became LTS on 2026-10-28. Run the full suite on it, then widen `engines` to `^24.14.0 || ^26`. Target: first quarter of 2027.
- **Stay on Node 24 until its end of life** (2028-04-30). Dropping it, and any older Node, is a major version.
- **Keep peer ranges current.** Each peer carries an upper bound and no floor (`keygrip` keeps its own `^1.1.0`). Review the bounds against the latest npm release of every peer at least once a quarter. Widen a bound only after the new major has been swapped into `node_modules` and `yarn test:coverage` passes.
- **TypeScript.** Follow the current stable major, keeping `strict` on.

### Security and supply chain

- Earn and keep the OpenSSF Best Practices badge, passing level first and then silver, and keep a published OpenSSF Scorecard result; fix findings those tools report.
- Publish releases from CI with an npm provenance attestation, in addition to signed git tags, so a consumer can verify where a tarball was built. The workflow is in `.github/workflows/release.yml`; it needs the npm trusted publisher to be configured first.
- Keep the documented threat model and assurance case ([docs/security.md](docs/security.md)) in step with every security-relevant change.
- Keep dependencies monitored: Dependabot, a scheduled audit and the Semgrep and Qodana gates. Triage every finding in a release's `CHANGELOG.md` entry or in an issue.

### Quality

- Keep 100% line, statement, function and branch coverage per file.
- Keep the documentation under `docs/code/` and `README.md` changed in the same commit as the code.
- Finish the English clean-up of comments, mutation descriptions and constant names that is still on the maintainer's to-do list.
- Look for a co-maintainer, so that more than one person knows the code, and name a backup owner and a second npm publisher ([GOVERNANCE.md](GOVERNANCE.md#bus-factor)).

## Under consideration, no commitment

- Make the `Secure` flag of the login cookies configurable, instead of leaving it to the reverse proxy.
- Turn `REDIS_TLS` on by default in a future major version. It is opt-in today so that existing deployments are unchanged.

## Will not do

- **No barrel export.** Every symbol keeps its own subpath so that optional peers stay optional.
- **No runtime `dependencies`.** The library stays dependency-free for consumers.
- **No published CommonJS build.** The package is ESM only.
- **No bundled copies of database drivers, ClamAV, sharp or other peers.**
- **No built-in i18n layer.** Email copy and error text are English and not locale-configurable; the HTML header and footer of the email wrapper can be replaced through the `SocketLabsLib` constructor.
- **No user interface and no standalone server.** This is a library that runs inside the consumer's Koa process.
- **No back-ports.** Only the latest release line receives fixes. Older versions that carry a real defect are deprecated on npm with the fixed version named.
- **No support for end-of-life Node.js releases or end-of-life majors of peer libraries.**

Suggestions for this page are welcome as issues.
