import { tooLargeReason } from '@private/glb/glbReason.mjs'

import { GLB_POLICY_DEFAULTS, type IGlbPolicy } from './GLB_POLICY_DEFAULTS.mjs'
import type { IGlbRejectCode } from './GLB_REJECT_CODES.mjs'
import type { IGlbContainerResult } from './IGlbContainer.mjs'

const MAGIC = 0x46_54_6c_67 // 'glTF' read as a little-endian uint32
const VERSION = 2
const CHUNK_JSON = 0x4e_4f_53_4a // 'JSON'
const CHUNK_BIN = 0x00_4e_49_42 // 'BIN\0'
const HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8
const JSON_START = HEADER_BYTES + CHUNK_HEADER_BYTES

const fail = (code: IGlbRejectCode, message: string): IGlbContainerResult => ({ ok: false, reason: { code, message } })

function readBin(view: DataView, bytes: Uint8Array, json: Uint8Array, offset: number): IGlbContainerResult {
	if (offset + CHUNK_HEADER_BYTES > bytes.length) {
		return fail('GLB_BAD_CHUNKS', 'bytes after the JSON chunk are too few for a BIN chunk')
	}
	if (view.getUint32(offset + 4, true) !== CHUNK_BIN) {
		return fail('GLB_BAD_CHUNKS', 'the chunk after the JSON chunk is not a BIN chunk')
	}
	const start = offset + CHUNK_HEADER_BYTES
	const end = start + view.getUint32(offset, true)
	if (end !== bytes.length) {
		return fail('GLB_BAD_CHUNKS', 'the BIN chunk does not end where the file ends')
	}
	return { ok: true, json, bin: bytes.subarray(start, end) }
}

function readChunks(view: DataView, bytes: Uint8Array, maxJsonBytes: number): IGlbContainerResult {
	if (view.getUint32(HEADER_BYTES + 4, true) !== CHUNK_JSON) {
		return fail('GLB_BAD_CHUNKS', 'the first chunk is not a JSON chunk')
	}
	const jsonLength = view.getUint32(HEADER_BYTES, true)
	if (jsonLength > maxJsonBytes) {
		return fail('GLB_JSON_TOO_LARGE', `the JSON chunk has ${jsonLength} bytes, the limit is ${maxJsonBytes}`)
	}
	const jsonEnd = JSON_START + jsonLength
	if (jsonEnd > bytes.length) {
		return fail('GLB_BAD_CHUNKS', 'the JSON chunk runs past the end of the file')
	}
	const json = bytes.subarray(JSON_START, jsonEnd)
	return jsonEnd === bytes.length ? { ok: true, json, bin: null } : readBin(view, bytes, json, jsonEnd)
}

/**
 * Check the container of a GLB without parsing its JSON: magic `glTF`, version 2, the length in the header against the
 * real size, and the chunk layout (one JSON chunk, then at most one BIN chunk, nothing else). Cheap, so a caller can use
 * it to turn a file away before any heavy work. Never throws on a hostile file.
 *
 * @param bytes the whole file
 * @param limits `maxBytes` and `maxJsonBytes` of {@link IGlbPolicy}; the defaults apply to a field that is left out
 */
export function checkGlbContainer(
	bytes: Uint8Array,
	limits: Partial<Pick<IGlbPolicy, 'maxBytes' | 'maxJsonBytes'>> = {}
): IGlbContainerResult {
	const maxBytes = limits.maxBytes ?? GLB_POLICY_DEFAULTS.maxBytes
	if (bytes.length > maxBytes) {
		return { ok: false, reason: tooLargeReason(bytes.length, maxBytes) }
	}
	if (bytes.length < JSON_START) {
		return fail('GLB_TRUNCATED', 'the file is too short to hold a header and a chunk')
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	if (view.getUint32(0, true) !== MAGIC) {
		return fail('GLB_BAD_MAGIC', 'the file does not start with glTF')
	}
	if (view.getUint32(4, true) !== VERSION) {
		return fail('GLB_BAD_VERSION', 'the GLB container version is not 2')
	}
	if (view.getUint32(8, true) !== bytes.length) {
		return fail('GLB_LENGTH_MISMATCH', `the header says ${view.getUint32(8, true)} bytes, the file has ${bytes.length}`)
	}
	return readChunks(view, bytes, limits.maxJsonBytes ?? GLB_POLICY_DEFAULTS.maxJsonBytes)
}
