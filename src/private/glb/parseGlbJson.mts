import type { IGlbReason } from '../../files/IGlbSanitiseResult.mjs'
import { type IJsonObject, isObject } from './jsonAccess.mjs'

export type IGlbJsonResult = { json: IJsonObject; reasons: [] } | { json: null; reasons: IGlbReason[] }

const invalid = (message: string): IGlbJsonResult => ({ json: null, reasons: [{ code: 'JSON_INVALID', message }] })

/** Decode the JSON chunk as strict UTF-8 and parse it. The result must be one JSON object. */
export function parseGlbJson(chunk: Uint8Array): IGlbJsonResult {
	let parsed: unknown
	try {
		parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(chunk))
	} catch {
		return invalid('the JSON chunk is not valid UTF-8 JSON')
	}
	return isObject(parsed) ? { json: parsed, reasons: [] } : invalid('the JSON chunk does not hold one JSON object')
}
