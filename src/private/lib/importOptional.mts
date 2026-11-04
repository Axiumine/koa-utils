// Node raises ERR_MODULE_NOT_FOUND for a missing ESM package; a CommonJS resolver (or a tool that wraps one) uses MODULE_NOT_FOUND.
const MISSING_CODES = new Set<unknown>(['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'])

/**
 * True only when `error` says that `specifier` itself is not installed. An installed package that fails to load one of
 * its own dependencies raises the same code for a different name; that one must surface, so the name is matched too.
 */
function isMissingPackage(error: unknown, specifier: string): boolean {
	const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown }
	return MISSING_CODES.has(code) && typeof message === 'string' && message.includes(`'${specifier}'`)
}

/**
 * Load an optional peer dependency. Resolves `null` when `specifier` is not installed, rethrows every other failure.
 *
 * The caller passes its own `() => import('pkg')`, so the specifier stays a string literal at the call site where
 * `tsc` types it and bundlers can see it. `specifier` repeats that name for the error match.
 */
export async function importOptional<T>(specifier: string, load: () => Promise<T>): Promise<T | null> {
	try {
		return await load()
	} catch (error) {
		if (isMissingPackage(error, specifier)) return null
		throw error
	}
}
