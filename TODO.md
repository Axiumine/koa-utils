# TODO

## 2026-10-30: recheck Stryker upstream for Mocha 12

Mutation testing (`yarn mutation`, see `CONTRIBUTING.md`) runs on StrykerJS. The Mocha runner plugin, `@stryker-mutator/mocha-runner` 10.1.1, declares the peer range `mocha >= 7.2 < 13` but crashes on Mocha 12. It loads three Mocha CLI helpers with `require('mocha/lib/cli/run-helpers')`, `.../options` and `.../collect-files`, and Mocha 12 ships them only as `.cjs` files inside a `"type": "module"` package, so the extensionless `require()` fails.

### What the shim is

A `patch-package` patch that edits one file of the plugin, `dist/src/lib-wrapper.js`: a small `requireCli(name)` helper tries the extensionless path first and falls back to `<name>.cjs`. It changes nothing else.

### Where it lives

- `patches/@stryker-mutator+mocha-runner+10.1.1.patch`: the patch. The version is part of the file name, so a bump of the plugin makes `patch-package` warn or fail until the patch is dropped or regenerated.
- `patch-package` in `devDependencies` of `package.json`.
- The patch step itself: `"mutation": "patch-package && stryker run"` in `package.json` (`yarn mutation:changed` goes through it), and the step `Mutation testing` in `.github/workflows/mutation.yml`, which runs `yarn mutation`.
- It is deliberately NOT a `preinstall`, `install` or `postinstall` script. The `scripts` block of `package.json` travels in the published tarball, and an install script would run on every consumer's machine, where `patch-package` does not exist. `patches/` does not ship either (`files` limits the tarball to `dist/`, `LICENSE`, `README.md` and `package.json`).

### Recheck

```
npm view @stryker-mutator/mocha-runner version peerDependencies --registry=https://registry.npmjs.org/
npm view @stryker-mutator/core version --registry=https://registry.npmjs.org/
```

Then read the release notes and open issues at https://github.com/stryker-mutator/stryker-js (search for "mocha 12" and "lib-wrapper"). The fix is in when a release newer than 10.1.1 ships Mocha 12 support: its `lib-wrapper.js` no longer does `require(`${mochaRoot}/lib/cli/run-helpers`)` without an extension, or it loads the helpers through `import()`.

### Removal steps, once a fixed release exists

1. Bump the three `@stryker-mutator/*` devDependencies to the fixed version, all the same exact version: `yarn add -D --exact --registry https://registry.npmjs.org/ @stryker-mutator/core@<v> @stryker-mutator/mocha-runner@<v> @stryker-mutator/typescript-checker@<v>`. Normalise any new `resolved` host in `yarn.lock` to `registry.npmjs.org`.
2. Delete `patches/` and run `yarn remove patch-package`.
3. In `package.json` set `"mutation": "stryker run"`.
4. In `.github/workflows/mutation.yml` update the comment above the `Mutation testing` step (the step itself already calls `yarn mutation`).
5. Remove the shim notes: the shim paragraph in `CLAUDE.md` (mutation section), the `patches/` line in `REPO.md`, and this entry.
6. Run `yarn mutation:changed` and a full `yarn mutation`, and confirm the score matches the previous run.

If the upstream fix never comes, the alternative is to keep the patch and regenerate it after every plugin bump with `npx patch-package @stryker-mutator/mocha-runner`.
