# File Upload Pipeline

This section covers the `src/files/*` modules that implement koa-utils' upload pipeline: an incoming multipart stream is first written to a temp file (`storeUploadAsTemp`), then run through extension and magic-number MIME validation, a ClamAV virus scan, an (currently disabled) NSFW check, a `sharp`-based re-encode that strips metadata, and finally a move out of the temp directory into its permanent home. The two orchestrators — `uploadTemp` (images) and `uploadTempPdf` (PDFs) — wire these building blocks together into a single call. Pieces are grouped below as constants/interfaces, validators, scanners, re-encoders, movers, and uploaders (orchestrators).

## Constants & interfaces

### `UPLOAD_TEMP_DIRECTORY_URL`

**Import:** `import { UPLOAD_TEMP_DIRECTORY_URL } from '@axiumine/koa-utils/files/fileConst'`

**Signature:**
```ts
export const UPLOAD_TEMP_DIRECTORY_URL = '/tmp'
```

Hard-coded absolute path used by `storeUploadAsTemp` as the staging directory for every upload before it is validated. It is not configurable via an env var — changing where temp uploads land requires editing this constant.

**Returns:** `string` — always `'/tmp'`.

### `UPLOAD_IMG_DIRECTORY_URL`

**Import:** `import { UPLOAD_IMG_DIRECTORY_URL } from '@axiumine/koa-utils/files/fileConst'`

**Signature:**
```ts
export const UPLOAD_IMG_DIRECTORY_URL = path.join(process.cwd(), 'upload/uimg')
```

Base directory for permanently stored images, resolved relative to the process's current working directory at import time (`<cwd>/upload/uimg`). Consumed by `moveImageFile` to build the final destination path.

**Returns:** `string` — absolute path.

### `IStoreFile`

**Import:** `import { IStoreFile } from '@axiumine/koa-utils/files/fileConst'`

**Signature:**
```ts
export interface IStoreFile {
	originalFilename: string
	fileName: string
	filePath: string
}
```

Shape returned by `storeUploadAsTemp`: the client-supplied original filename, the generated (UUID-based) stored filename, and the full temp-directory path the file was written to.

### `IUploadTemp`

**Import:** `import { IUploadTemp } from '@axiumine/koa-utils/files/IUploadTemp'`

**Signature:**
```ts
export interface IUploadTemp {
	tempFile: string
	ext: string
}
```

Shape returned by the two pipeline orchestrators (`uploadTemp`, `uploadTempPdf`): the final temp-file path after all processing and the resulting extension (`'webp'` or `'pdf'`), ready to be handed to a mover (`moveImageFile` / `moveFileStaticDomain`).

## Validators

### `validateExtension`

**Import:** `import { validateExtension } from '@axiumine/koa-utils/files/validateExtension'`

**Signature:**
```ts
export const validateExtension = (filename: string, allowedExtensions: string[]) => {
	const ext = path.extname(filename).toLowerCase()
	return allowedExtensions.includes(ext)
}
```

Pure utility: lower-cases the extension of `filename` (via `path.extname`) and checks membership in `allowedExtensions`. Does not touch the filesystem and never throws — it is the primitive that `validateJpgPngExtension` and `validatePdfExtension` build on.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| filename | string | Filename (or path) whose extension is checked. |
| allowedExtensions | string[] | Extensions to allow, each including the leading dot and in lower case (e.g. `'.png'`). |

**Returns:** `boolean` — `true` if the lower-cased extension is in `allowedExtensions`.

### `validateJpgPngExtension`

**Import:** `import { validateJpgPngExtension } from '@axiumine/koa-utils/files/validateJpgPngExtension'`

**Signature:**
```ts
export async function validateJpgPngExtension(filename: string, filePath: string)
```

Restricts uploads to `.jpg`, `.jpeg`, `.png` using `validateExtension`. On a failed check it deletes the on-disk temp file (`fs.remove(filePath)`, from `fs-extra`) before throwing, so a rejected upload never lingers on disk.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| filename | string | Original/stored filename used only to read the extension. |
| filePath | string | Path of the temp file on disk, removed if validation fails. |

**Returns:** `Promise<void>`.

**Throws:** `Error('Invalid file extension')` — if the extension is not jpg/jpeg/png.

### `validatePdfExtension`

**Import:** `import { validatePdfExtension } from '@axiumine/koa-utils/files/validatePdfExtension'`

**Signature:**
```ts
export async function validatePdfExtension(filename: string, filePath: string)
```

Same pattern as `validateJpgPngExtension` but restricted to `.pdf`. Removes `filePath` via `fs-extra` before throwing on a mismatch. Used internally by `uploadTempPdf`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| filename | string | Original/stored filename used only to read the extension. |
| filePath | string | Path of the temp file on disk, removed if validation fails. |

**Returns:** `Promise<void>`.

**Throws:** `Error('Invalid file extension')` — if the extension is not `.pdf`.

### `validateMimeType`

**Import:** `import { validateMimeType } from '@axiumine/koa-utils/files/validateMimeType'`

**Signature:**
```ts
export async function validateMimeType(filePath: string, allowedMimeTypes: string[]): Promise<string>
```

Magic-number (content-based, not extension-based) MIME validation. Delegates detection to the internal `_validateMimeType` helper (`@private/files/_validateMimeType.mjs`, not part of the public API), which dynamically imports `file-type` and calls `fileTypeFromFile`. If the detected MIME type is not in `allowedMimeTypes` (or no type could be detected), the temp file is deleted via `fs-extra`'s `fs.remove` and an error is thrown.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| filePath | string | Path of the file to inspect on disk. |
| allowedMimeTypes | string[] | Full MIME strings to accept, e.g. `'image/jpeg'`. |

**Returns:** `Promise<string>` — the detected file extension (from `file-type`, not the allowed MIME string) when it passes.

**Throws:** `Error('Invalid file MIME type')` — when the detected MIME type is empty or not allowed; the file is removed from disk first.

### `validateJpgPngMimeType`

**Import:** `import { validateJpgPngMimeType } from '@axiumine/koa-utils/files/validateMimeTypeImages'` or `import { validateJpgPngMimeType } from '@axiumine/koa-utils/files/validateJpgPngMimeType'`

> Note: this symbol lives in `src/files/validateMimeTypeImages.mts` and exports the function `validateJpgPngMimeType` — filename and function name differ. `package.json` declares **two** export keys that both resolve to the same built file (`dist/files/validateMimeTypeImages.mjs`): `./files/validateMimeTypeImages` (matches the source filename) and `./files/validateJpgPngMimeType` (matches the exported function name). Either subpath works; pick whichever reads better at the call site.

**Signature:**
```ts
export async function validateJpgPngMimeType(filePath: string): Promise<string>
```

Thin wrapper over `validateMimeType` fixed to `['image/jpeg', 'image/png']`. Used by the image upload pipeline (`uploadTemp`) right after the extension check.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| filePath | string | Path of the file to inspect on disk. |

**Returns:** `Promise<string>` — detected extension on success.

**Throws:** `Error('Invalid file MIME type')` — propagated from `validateMimeType` if content is not JPEG/PNG.

### `validateMimeTypePdf`

**Import:** _internal — not exported_ (no `./files/validateMimeTypePdf` entry in `package.json` `exports`).

**Signature:**
```ts
export async function validateMimeTypePdf(filePath: string): Promise<string>
```

Thin wrapper over `validateMimeType` fixed to `['application/pdf']`. Used by `uploadTempPdf` right after the PDF extension check.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| filePath | string | Path of the file to inspect on disk. |

**Returns:** `Promise<string>` — detected extension (`'pdf'`) on success.

**Throws:** `Error('Invalid file MIME type')` — propagated from `validateMimeType` if content is not a PDF.

## Scanners

### `initClamScan`

**Import:** `import { initClamScan } from '@axiumine/koa-utils/files/scanVirus'`

**Signature:**
```ts
export async function initClamScan(options?: Partial<NodeClam.Options>)
```

Initializes the module-level ClamAV (`clamscan`) singleton used by `scanVirus`. Must be called once during Koa app bootstrap before any upload is processed. Default options: `removeInfected: true`, `quarantineInfected: false`, `clamdscan: { socket: '/var/run/clamav/clamd.ctl', timeout: 60000, multiscan: true, localFallback: false }`, `debugMode: false`. The caller-supplied `options` are merged with a **shallow** `{ ...defaultOptions, ...options }` spread — passing a partial `clamdscan` object (e.g. `{ clamdscan: { timeout: 5000 } }`) replaces the whole nested `clamdscan` object rather than merging into it, silently dropping `socket`, `multiscan`, and `localFallback`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| options | `Partial<NodeClam.Options>` (optional) | Overrides for the default ClamAV/clamdscan config; merged shallowly over the defaults. |

**Returns:** `Promise<NodeClam>` — the initialized ClamScan instance (also stored in the module-private `clamScanInstance`).

**Throws:** rethrows whatever `NodeClam.init` throws, after reporting it to Sentry via `Sentry.captureException(e)`.

**Notes:** Logs `[ClamScan] init...` / `[ClamScan] OK: ...` / `[ClamScan] Error` via `console.info`/`console.error`.

### `scanVirus`

**Import:** `import { scanVirus, IScanVirusResult } from '@axiumine/koa-utils/files/scanVirus'`

**Signature:**
```ts
export async function scanVirus(filePath: string): Promise<IScanVirusResult>
```
```ts
export interface IScanVirusResult {
	isInfected: boolean
	viruses: string[]
	alerted: boolean
	scanned: boolean
}
```

Scans `filePath` with the singleton initialized by `initClamScan`. If the file is infected, it reports a Sentry warning (tag `file`, context `viruses: { list, count }`, message `Infected file detected: ${filePath}`) and sets `alerted: true` — it does **not** throw and does **not** delete the file itself; deletion of infected files is left to ClamAV's own `removeInfected: true` default set in `initClamScan`. If the scan itself errors (e.g. daemon unreachable), the error is only reported to Sentry (`Sentry.captureException`); `scanVirus` never rejects on a scan failure, instead resolving with `{ isInfected: false, viruses: [], alerted: false, scanned: false }`, so the pipeline continues even if the virus scan could not run. `scanned: false` means the scan did not complete — treat that as unknown, not as clean.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| filePath | string | Path of the file to scan. |

**Returns:** `Promise<IScanVirusResult>` — on a completed scan, `isInfected`/`viruses` come from ClamAV, `alerted` is `true` only when the infected-file Sentry warning fired, and `scanned` is `true`. On a scan failure, resolves with `{ isInfected: false, viruses: [], alerted: false, scanned: false }` instead of rejecting.

**Throws:** `Error('ClamScan has not been initialized. Call initClamScan first.')` — only if `initClamScan` was never called.

### `checkForNSFW`

**Import:** _internal — not exported_ (the entire file is a block comment; there is currently no live code, only a `// const Sightengine = require(...)` line and a commented-out reference implementation).

**Signature (commented-out, not currently active):**
```ts
// export async function checkForNSFW(imageUrl: string) {
//   const result = await Sightengine.check(['nudity', 'wad']).set_url(imageUrl)
//   if (result.nudity.safe < 0.9) return false
//   return true
// }
```

Placeholder for a NSFW-content moderation step (intended to call sightengine.com or a similar service). It is disabled: `src/files/checkForNSFW.mts` contains no executable code, and both `uploadTemp` and `uploadTempPdf` reference the call only inside a comment (`// await checkForNSFW(filePath)`). The upload pipeline currently performs no NSFW check at all.

## Re-encoders

### `reEncodeToJpeg`

**Import:** `import { reEncodeToJpeg } from '@axiumine/koa-utils/files/reEncodeToJpeg'`

**Signature:**
```ts
export async function reEncodeToJpeg(filename: string, quality = 100)
```

Re-encodes an image file to progressive JPEG and strips all metadata (EXIF, etc.). Delegates to the private `reEncode` helper (`@private/files/reEncode.mjs`, not part of the public API), which first reads the source file into a `Buffer` (`fs.readFile(filePath)`) and then runs `sharp(input).jpeg({ quality, progressive: true }).withMetadata({}).withExif({}).toFile(finalFilepath)` — the buffered read is deliberate: `sharp` refuses to use the same file path as both input and output, which happens whenever the source already carries the target extension (e.g. `reEncodeToJpeg('x.jpeg')`). If the source extension differed from `'jpeg'`, the original file is deleted afterward.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| filename | string | Path of the source file to re-encode. |
| quality | number (default `100`) | JPEG quality passed to `sharp`. |

**Returns:** `Promise<string>` — path of the newly written `.jpeg` file.

**Throws:** `Error('Error processing the image')` — if `sharp` fails (reported to Sentry first). Also rethrows `throwInternalError()` if the original file couldn't be unlinked after re-encoding to a different extension.

### `reEncodeToPng`

**Import:** `import { reEncodeToPng } from '@axiumine/koa-utils/files/reEncodeToPng'`

**Signature:**
```ts
export async function reEncodeToPng(filename: string, quality = 100)
```

Same as `reEncodeToJpeg` but targets PNG: `reEncode` reads the source into a `Buffer` first, then runs `sharp(input).png({ quality, progressive: true }).withMetadata({}).withExif({}).toFile(finalFilepath)`, stripping metadata and deleting the original if its extension differed from `'png'`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| filename | string | Path of the source file to re-encode. |
| quality | number (default `100`) | PNG quality passed to `sharp`. |

**Returns:** `Promise<string>` — path of the newly written `.png` file.

**Throws:** `Error('Error processing the image')` — if `sharp` fails. Also can throw `throwInternalError()` if unlinking the original fails.

### `reEncodeToWebp`

**Import:** `import { reEncodeToWebp } from '@axiumine/koa-utils/files/reEncodeToWebp'`

**Signature:**
```ts
export async function reEncodeToWebp(filename: string, quality = 100)
```

Same pattern targeting WebP: `reEncode` reads the source into a `Buffer` first, then runs `sharp(input).webp({ quality, lossless: true }).withMetadata({}).withExif({}).toFile(finalFilepath)`. This is the re-encoder used by the image upload pipeline (`uploadTemp`), which always converts to `'webp'` regardless of the original jpg/png extension, and strips metadata/EXIF. Note that `lossless: true` combined with a `quality` argument is somewhat redundant for WebP's lossless mode, but that is what the underlying `sharp` call passes through unchanged.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| filename | string | Path of the source file to re-encode. |
| quality | number (default `100`) | Quality option passed to `sharp`'s WebP encoder. |

**Returns:** `Promise<string>` — path of the newly written `.webp` file.

**Throws:** `Error('Error processing the image')` — if `sharp` fails. Also can throw `throwInternalError()` if unlinking the original fails.

## Movers

### `moveTempFile`

**Import:** `import { moveTempFile } from '@axiumine/koa-utils/files/moveTempFile'`

**Signature:**
```ts
export async function moveTempFile(sourceFilePath: string, destFilename: string, destinationDir: string)
```

Low-level mover used by both `moveImageFile` and `moveFileStaticDomain`. First validates `destFilename` with the private `assertNoTraversal` helper (`@private/files/assertNoTraversal.mjs`), then ensures `destinationDir` exists (`fs.ensureDir`, creating it recursively if needed), then moves `sourceFilePath` to `${destinationDir}/${destFilename}${ext}` where `ext` is `path.extname(sourceFilePath)` — **the extension is always taken from the source path, not from `destFilename`**, so any extension already present in `destFilename` is ignored/duplicated rather than reused. `sourceFilePath` and `destinationDir` are caller-owned paths and are intentionally not validated here.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| sourceFilePath | string | Current (temp) location of the file to move. |
| destFilename | string | Base name (without extension) for the destination file. |
| destinationDir | string | Directory the file is moved into; created if missing. |

**Returns:** `Promise<void>`.

**Throws:** `Error('Invalid destFilename: path traversal')` — if `destFilename`, split on `/` or `\`, contains a literal `..` segment.

### `moveImageFile`

**Import:** `import { moveImageFile } from '@axiumine/koa-utils/files/moveImageFile'`

**Signature:**
```ts
export async function moveImageFile(sourceFilePath: string, folder: string, secondFolder: string, destFilename: string)
```

Validates `folder` and `secondFolder` with `assertNoTraversal`, then moves a re-encoded image out of the temp directory into the package's image tree: `${UPLOAD_IMG_DIRECTORY_URL}/${folder}/${secondFolder}` (i.e. `<cwd>/upload/uimg/<folder>/<secondFolder>`), delegating the actual move to `moveTempFile`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| sourceFilePath | string | Temp file path (typically the `tempFile` from `uploadTemp`). |
| folder | string | First-level subdirectory under `UPLOAD_IMG_DIRECTORY_URL`. |
| secondFolder | string | Second-level subdirectory. |
| destFilename | string | Base destination filename (extension is derived from `sourceFilePath`, see `moveTempFile`). |

**Returns:** `Promise<void>`.

**Throws:** `Error('Invalid folder: path traversal')` or `Error('Invalid secondFolder: path traversal')` — if `folder`/`secondFolder` contains a `..` segment. Also propagates `moveTempFile`'s `destFilename` traversal check.

### `moveFileStaticDomain`

**Import:** `import { moveFileStaticDomain } from '@axiumine/koa-utils/files/moveFileStaticDomain'`

**Signature:**
```ts
export async function moveFileStaticDomain(sourceFilePath: string, folder: string, secondFolder: string, destFilename: string)
```

Validates `folder` and `secondFolder` with `assertNoTraversal`, then moves a file into a consumer-configured static-serving root read from the `STATIC_FOLDER` env var: `${process.env.STATIC_FOLDER}/${folder}/${secondFolder}`, delegating to `moveTempFile`. Intended for non-image assets (e.g. re-encoded PDFs) served from a static domain outside the `upload/uimg` image tree.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| sourceFilePath | string | Temp file path to move. |
| folder | string | First-level subdirectory under `STATIC_FOLDER`. |
| secondFolder | string | Second-level subdirectory. |
| destFilename | string | Base destination filename (extension is derived from `sourceFilePath`, see `moveTempFile`). |

**Returns:** `Promise<void>`.

**Throws:** `Error('Invalid folder: path traversal')` or `Error('Invalid secondFolder: path traversal')` — if `folder`/`secondFolder` contains a `..` segment. Also propagates `moveTempFile`'s `destFilename` traversal check.

**Notes:** Reads `process.env.STATIC_FOLDER`; if unset, the destination path literally contains `undefined`.

## Uploaders

### `storeUploadAsTemp`

**Import:** `import { storeUploadAsTemp } from '@axiumine/koa-utils/files/storeUploadAsTemp'`

**Signature:**
```ts
export async function storeUploadAsTemp(upload: Promise<IFileUpload>, maxFileSize: number = MAX_FILE_SIZE): Promise<IStoreFile>
```

Step 1 of the pipeline: awaits the incoming `IFileUpload` (from `../koa/IFileUpload.mjs`), generates a temp filename as `uuidv4() + <lower-cased original extension>`, and streams it to `${UPLOAD_TEMP_DIRECTORY_URL}/<storedFileName>` (i.e. `/tmp/<uuid><ext>`) while counting bytes as they arrive. `MAX_FILE_SIZE` defaults to `5 * 1024 * 1024` (5 MB) and can be overridden per call via `maxFileSize`. If the running total exceeds the limit mid-stream, the write stream is destroyed and the partial file unlinked before rejecting.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| upload | `Promise<IFileUpload>` | The GraphQL/Koa file-upload promise (`createReadStream`, `filename`, `mimetype`, `encoding`). |
| maxFileSize | number (default `5 * 1024 * 1024`) | Maximum accepted size in bytes; exceeding it aborts and deletes the partial file. |

**Returns:** `Promise<IStoreFile>` — `{ originalFilename, fileName, filePath }` for the stored temp file.

**Throws:** `Error('File size exceeds the limit of ${maxFileSize} bytes')` — when the stream exceeds `maxFileSize`, reporting the limit in bytes. On a write/read-stream error, rejects with the underlying `Error` itself (not a generic message) — the 'error' handler records it and the 'close' handler rejects with the recorded error after unlinking the partial file. Both paths are covered by `test/files/storeUploadAsTemp.spec.mts`.

### `uploadTemp`

**Import:** `import { uploadTemp } from '@axiumine/koa-utils/files/uploadTempImage'`

> Note: the exported function is named `uploadTemp`, **not** `uploadTempImage` — only the file name and the `package.json` export key (`./files/uploadTempImage`) use the `uploadTempImage` spelling.

**Signature:**
```ts
export async function uploadTemp(img: Promise<IFileUpload>): Promise<IUploadTemp>
```

Full image-upload orchestrator: `storeUploadAsTemp(img)` → `validateJpgPngExtension(fileName, filePath)` → `validateJpgPngMimeType(filePath)` → `scanVirus(filePath)` → `reEncodeToWebp(filePath)`. The NSFW step (`checkForNSFW`) is commented out and not executed. Every step runs inside a single `try`/`catch`; any thrown error (from validation, virus scan initialization, or re-encoding) is logged via `console.error('Error storing image:', e)` and replaced with a new generic error, losing the original error detail/type.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| img | `Promise<IFileUpload>` | Incoming file upload promise, same shape consumed by `storeUploadAsTemp`. |

**Returns:** `Promise<IUploadTemp>` — `{ ext: 'webp', tempFile: <path to re-encoded .webp file> }`.

**Throws:** `Error('Error storing image')` — wraps any failure from the steps above; the original error is not preserved on the thrown object, only logged to the console.

**Notes:** Does not call a mover — the caller is expected to pass `tempFile` to `moveImageFile` afterward. Rate limiting, upload logging (`logUpload`), and safe-filename steps are marked `@todo`/done-elsewhere in comments, not implemented in this function.

### `uploadTempPdf`

**Import:** `import { uploadTempPdf } from '@axiumine/koa-utils/files/uploadTempPdf'`

**Signature:**
```ts
export async function uploadTempPdf(pdf: Promise<IFileUpload>): Promise<IUploadTemp>
```

Full PDF-upload orchestrator: `storeUploadAsTemp(pdf)` → `validatePdfExtension(fileName, filePath)` → `validateMimeTypePdf(filePath)` → `scanVirus(filePath)`. Unlike the image pipeline there is **no re-encode step** — `storedTempFile` is set directly to the validated temp `filePath` (a `@todo` comment notes re-encoding via `dangerzone` is not yet implemented). Errors from any step are caught, logged via `console.error('Error storing pdf:', e)`, and replaced with a generic error.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| pdf | `Promise<IFileUpload>` | Incoming file upload promise, same shape consumed by `storeUploadAsTemp`. |

**Returns:** `Promise<IUploadTemp>` — `{ ext: 'pdf', tempFile: <path to the validated temp file, unmodified> }`.

**Throws:** `Error('Error storing pdf')` — wraps any failure from the steps above; the original error is not preserved, only logged to the console.

**Notes:** Because there is no re-encode step, the returned `tempFile` is the same on-disk file `storeUploadAsTemp` wrote — the caller is expected to move it out of `/tmp` (e.g. via `moveFileStaticDomain`) promptly.
