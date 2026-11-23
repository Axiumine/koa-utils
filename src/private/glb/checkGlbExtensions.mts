import type { IGlbReason } from '../../files/IGlbSanitiseResult.mjs'
import { GLB_FORBIDDEN_EXTENSIONS } from './glbExtensions.mjs'
import { childOf, field, type IJsonObject, listOf } from './jsonAccess.mjs'

/** Every extension name the file declares, in `extensionsUsed`, in `extensionsRequired` or as a key of the root `extensions`. Each name once. */
function declaredNames(json: IJsonObject): string[] {
	const raw = [
		...listOf(field(json, 'extensionsUsed')),
		...listOf(field(json, 'extensionsRequired')),
		...Object.keys(childOf(json, 'extensions'))
	]
	return [...new Set(raw.map(String))]
}

function reasonFor(name: string, allowed: ReadonlySet<string>): IGlbReason[] {
	if (GLB_FORBIDDEN_EXTENSIONS.includes(name)) {
		return [{ code: 'EXTENSION_FORBIDDEN', message: `${name} is never allowed` }]
	}
	return allowed.has(name) ? [] : [{ code: 'EXTENSION_NOT_ALLOWED', message: `${name} is not in allowedExtensions` }]
}

/**
 * Every declared extension must be in the allow list. `KHR_interactivity` has its own code. Undeclared use of an
 * extension deeper in the JSON is an error of the Khronos validator (`UNDECLARED_EXTENSION`), which runs next.
 */
export function checkGlbExtensions(json: IJsonObject, allowedExtensions: readonly string[]): IGlbReason[] {
	const allowed = new Set(allowedExtensions)
	return declaredNames(json).flatMap((name) => reasonFor(name, allowed))
}
