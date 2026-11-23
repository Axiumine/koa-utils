/** A parsed glTF JSON object whose shape nobody has checked yet. */
export type IJsonObject = Record<string, unknown>

/** True for a plain JSON object: not `null`, not an array. */
export const isObject = (value: unknown): value is IJsonObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

/** The elements of a JSON array, or an empty list for anything else. */
export const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? (value as unknown[]) : [])

/** A non-negative integer, or `0` for anything else. Hostile JSON can put any value in any field. */
export const countOf = (value: unknown): number =>
	typeof value === 'number' && Number.isSafeInteger(value) ? Math.max(0, value) : 0

/**
 * `object[key]` for an own property only, so a key such as `constructor` or `__proto__` reads nothing from the prototype.
 * Every key passed here is a literal of this package, never a name from the file.
 */
export const field = (object: IJsonObject, key: string): unknown =>
	// eslint-disable-next-line security/detect-object-injection -- `key` is a literal of this package and the read is limited to own properties
	Object.hasOwn(object, key) ? object[key] : undefined

/** The object at `list[index]`, or an empty object when the index is not a valid position or the element is not an object. */
export const itemOf = (list: unknown[], index: unknown): IJsonObject => {
	const item = typeof index === 'number' && index >= 0 ? list.at(index) : undefined
	return isObject(item) ? item : {}
}

/** `object[key]` as an object, or an empty object. */
export const childOf = (object: IJsonObject, key: string): IJsonObject => {
	const child = field(object, key)
	return isObject(child) ? child : {}
}
