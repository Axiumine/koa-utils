/**
 * Reads one property of a value that is an object, or answers `undefined` for anything else (a primitive, `null`).
 * The read is shape-agnostic on purpose: callers check the type of what comes back.
 */
export function readField(value: unknown, key: string): unknown {
	if (typeof value !== 'object' || value === null) return undefined
	return Reflect.get(value, key)
}
