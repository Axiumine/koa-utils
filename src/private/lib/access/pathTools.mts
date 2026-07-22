/**
 * Read a dotted mongo path out of a lean document.
 *
 * `.lean()` hands back a plain object, so a configured path such as `account.email.hash` has to be
 * walked by hand. Any missing or non-object link yields `undefined` rather than throwing: a path
 * pointing at a field the document does not carry must read as "absent", exactly like a projection
 * that left the field out, so the callers' existing `typeof x === 'undefined'` guards keep working.
 */
export function readPath(source: unknown, path: string): unknown {
	let current: unknown = source

	for (const key of path.split('.')) {
		if (current === null || typeof current !== 'object') {
			return undefined
		}
		current = (current as Record<string, unknown>)[key]
	}

	return current
}

/**
 * Build a mongo `$unset` payload from a list of paths.
 *
 * The list is supplied by the caller, never derived from the fields that were written: a layout
 * storing the reset request as one required subdocument can only be cleared by unsetting the
 * container, not its members. See `IResetPwdPaths.resetClear`.
 */
export function buildUnset(paths: readonly string[]): Record<string, ''> {
	const unset: Record<string, ''> = {}

	for (const path of paths) {
		unset[path] = ''
	}

	return unset
}

/**
 * Build a `.select()` projection string, always including `_id`.
 *
 * Every field a resolver reads must be listed here. A `.lean()` read of a field left out of the
 * projection is simply absent, with no error — that is how a missing `account.email.requestTimes`
 * turned every wrong-hash attempt into a 500 while the coverage gate stayed green.
 */
export function buildProjection(paths: readonly string[]): string {
	return ['_id', ...paths].join(' ')
}
