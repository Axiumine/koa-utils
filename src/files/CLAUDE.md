# src/files — agent rules

Repo-wide rules in root `CLAUDE.md`. Editing this file → Rule 0 there first (caveman ultra via `caveman:caveman` skill; skill missing = blocked).

## Rules

- `reEncode` read source into Buffer before encoding, **on purpose**: `sharp(filePath)` refuse same file as input + output → happen whenever source already carry target ext (`reEncodeToJpeg('x.jpeg')`). Never "optimise" back to `sharp(filePath)`.
- `reEncode` decide delete-original by comparing **paths** (`finalFilepath !== filePath`), not extensions. Ext compare → delete the file just written whenever both paths coincide, e.g. `filePath` with no extension at all.
- `sharp` = sealed ES module namespace. `sinon.stub()` on it fail: "ES Modules cannot be stubbed". Drive real lib against fixture.
- `console.info` / `console.error` / `console.log` stay here (`scanVirus.mts`, upload helpers) — carry conn + error reporting. Still no `console.debug`, still no commented-out `console.*`.
- `checkForNSFW.mjs` fully commented out, excluded in `.c8rc.json`. Reviving it → its tests land in same change.
- GLB: `sanitiseGlb` never throw on hostile file → `{ accepted: false, reasons }`. Only misuse throw (`TypeError`, `RangeError`). No stage throw on file data.
- GLB: `sanitiseGlb` copy input first (`new Uint8Array(input)`). glTF Transform read from offset 0 of underlying buffer → pooled `Buffer` / view fail `READ_FAILED`. Copy also freeze bytes vs caller mutation. Never "optimise" away.
- GLB order fixed: container → JSON → policy → validator → rewrite → verify. Cheap reject before any decode. Never allocate or decode from number file declare. Texture size from header only.
- GLB allowlist: no Draco (no decoder → unchecked data). `KHR_interactivity` refused whatever list say. Name outside `GLB_SUPPORTED_EXTENSIONS` in `allowedExtensions` → `RangeError`.
- GLB limit new/changed → `IGlbPolicy` + `GLB_POLICY_DEFAULTS` + pin in `test/files/glbConstants.spec.mts` + `docs/code/files.md` table + CHANGELOG. Reason code new → `GLB_REJECT_CODES` + same pin.
- `gltf-validator` peer `>=2.0.0-0 <3`. Only `2.0.0-dev.*` exist, plain `<3` no match prerelease → peer warn. Floor = lowest 2.0.0 prerelease, assert nothing. Re-check with `npm view gltf-validator versions` before touch.

## Docs, same commit

`src/files/**` → `docs/code/files.md` **and** `src/files/Readme.md`.
