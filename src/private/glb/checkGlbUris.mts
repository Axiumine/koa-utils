import type { IGlbReason } from '../../files/IGlbSanitiseResult.mjs'
import { field, type IJsonObject, isObject, listOf } from './jsonAccess.mjs'

const COLLECTIONS = ['buffers', 'images'] as const

function reasonFor(collection: string, index: number, uri: unknown): IGlbReason {
	const pointer = `/${collection}/${index}/uri`
	if (typeof uri === 'string' && /^data:/i.test(uri)) {
		return {
			code: 'URI_DATA',
			pointer,
			message: `${collection}[${index}] carries a data: URI, only the embedded GLB buffer is allowed`
		}
	}
	return {
		code: 'URI_EXTERNAL',
		pointer,
		message: `${collection}[${index}] points at an external resource, only the embedded GLB buffer is allowed`
	}
}

/**
 * Every buffer and image must live inside the GLB: no `uri` at all. A `data:` URI gets its own code. Anything else (a
 * relative path with `../`, an absolute path, `http:`, `file:`, even a non-string value) is `URI_EXTERNAL`.
 */
export function checkGlbUris(json: IJsonObject): IGlbReason[] {
	return COLLECTIONS.flatMap((collection) =>
		listOf(field(json, collection)).flatMap((item, index) =>
			isObject(item) && field(item, 'uri') !== undefined ? [reasonFor(collection, index, field(item, 'uri'))] : []
		)
	)
}
