# src/files — agent rules

Repo-wide rules in root `CLAUDE.md`. Editing this file → Rule 0 there first (caveman ultra via `caveman:caveman` skill; skill missing = blocked).

## Rules

- `reEncode` read source into Buffer before encoding, **on purpose**: `sharp(filePath)` refuse same file as input + output → happen whenever source already carry target ext (`reEncodeToJpeg('x.jpeg')`). Never "optimise" back to `sharp(filePath)`.
- `reEncode` decide delete-original by comparing **paths** (`finalFilepath !== filePath`), not extensions. Ext compare → delete the file just written whenever both paths coincide, e.g. `filePath` with no extension at all.
- `sharp` = sealed ES module namespace. `sinon.stub()` on it fail: "ES Modules cannot be stubbed". Drive real lib against fixture.
- `console.info` / `console.error` / `console.log` stay here (`scanVirus.mts`, upload helpers) — carry conn + error reporting. Still no `console.debug`, still no commented-out `console.*`.
- `checkForNSFW.mjs` fully commented out, excluded in `.c8rc.json`. Reviving it → its tests land in same change.

## Docs, same commit

`src/files/**` → `docs/code/files.md` **and** `src/files/Readme.md`.
