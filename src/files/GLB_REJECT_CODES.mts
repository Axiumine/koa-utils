/**
 * The closed reasons a GLB upload is rejected for (see `IGlbReason` in `IGlbSanitiseResult`):
 *
 * - `GLB_TOO_LARGE`: the file is bigger than `maxBytes`.
 * - `GLB_TRUNCATED`: the file is shorter than the 12 byte header plus one chunk header.
 * - `GLB_BAD_MAGIC`: the first four bytes are not `glTF`.
 * - `GLB_BAD_VERSION`: the container version is not 2.
 * - `GLB_LENGTH_MISMATCH`: the length in the header differs from the real size of the file.
 * - `GLB_BAD_CHUNKS`: the chunks are not exactly one JSON chunk followed by at most one BIN chunk, or one of them overruns the file.
 * - `GLB_JSON_TOO_LARGE`: the JSON chunk is bigger than `maxJsonBytes`.
 * - `JSON_INVALID`: the JSON chunk is not UTF-8 text holding one JSON object.
 * - `URI_EXTERNAL`: a buffer or image points at a file or a URL. Only the embedded GLB buffer is allowed.
 * - `URI_DATA`: a buffer or image carries a `data:` URI. Only the embedded GLB buffer is allowed.
 * - `EXTENSION_FORBIDDEN`: the file uses an extension that is always refused (`KHR_interactivity`).
 * - `EXTENSION_NOT_ALLOWED`: the file uses an extension that is not in `allowedExtensions`.
 * - `LIMIT_EXCEEDED`: a count or a size is over the limit named in `limit` (see `IGlbPolicy`).
 * - `IMAGE_UNREADABLE`: an image has no bytes inside the BIN chunk, or its header cannot be read.
 * - `IMAGE_UNSUPPORTED`: the bytes of an image are not PNG, JPEG, WebP or KTX2.
 * - `IMAGE_FORMAT_MISMATCH`: the `mimeType` of an image names another format than its bytes.
 * - `IMAGE_DECODE_FAILED`: the image passed the header check but could not be decoded and re-encoded.
 * - `VALIDATOR_ERROR`: the Khronos glTF Validator reported an error.
 * - `VALIDATOR_FAILED`: the Khronos glTF Validator crashed on the file.
 * - `MESHOPT_DECODE_FAILED`: the `EXT_meshopt_compression` data does not decode.
 * - `READ_FAILED`: the glTF Transform reader could not read the file.
 * - `OUTPUT_INVALID`: the rewritten file failed its own check (validator or decode). Never expected: the input is rejected instead.
 */
export const GLB_REJECT_CODES = [
	'GLB_TOO_LARGE',
	'GLB_TRUNCATED',
	'GLB_BAD_MAGIC',
	'GLB_BAD_VERSION',
	'GLB_LENGTH_MISMATCH',
	'GLB_BAD_CHUNKS',
	'GLB_JSON_TOO_LARGE',
	'JSON_INVALID',
	'URI_EXTERNAL',
	'URI_DATA',
	'EXTENSION_FORBIDDEN',
	'EXTENSION_NOT_ALLOWED',
	'LIMIT_EXCEEDED',
	'IMAGE_UNREADABLE',
	'IMAGE_UNSUPPORTED',
	'IMAGE_FORMAT_MISMATCH',
	'IMAGE_DECODE_FAILED',
	'VALIDATOR_ERROR',
	'VALIDATOR_FAILED',
	'MESHOPT_DECODE_FAILED',
	'READ_FAILED',
	'OUTPUT_INVALID'
] as const

/** One of {@link GLB_REJECT_CODES}. */
export type IGlbRejectCode = (typeof GLB_REJECT_CODES)[number]
