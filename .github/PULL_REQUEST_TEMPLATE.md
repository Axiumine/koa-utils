## What and why

<!-- One or two sentences. Link the issue: Fixes #123 -->

## Checklist

- [ ] Changed `.mts` files under `src/` have tests in `test/`; `yarn test:coverage` shows 100% on all four metrics
- [ ] `yarn lint:check` is clean
- [ ] The matching `docs/code/*.md` page is updated (and `REPO.md` if a file under `src/` was added, moved or removed)
- [ ] Any consumer-visible change is described below (the maintainer writes the `CHANGELOG.md` entry when the version is bumped)
- [ ] No new `dependencies`; no peer-range change without a linked discussion
- [ ] A new public symbol has its `exports` entry in `package.json`
- [ ] Commit messages follow `<type>(<scope>): <subject>`, whole message at most 150 characters
- [ ] This is not a security fix for an undisclosed vulnerability (those go through [SECURITY.md](https://github.com/Axiumine/koa-utils/blob/main/SECURITY.md))

## Breaking change?

<!-- No / Yes: what breaks and what a consumer must change -->
