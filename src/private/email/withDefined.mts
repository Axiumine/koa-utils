/** The same fields without the ones whose value is `undefined`: such a key is absent in the result, not present with no value. */
export function withDefined<T extends Record<string, unknown>>(fields: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
	return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as {
		[K in keyof T]?: Exclude<T[K], undefined>
	}
}
