import { importOptional } from '@private/lib/importOptional.mjs'

/** The one method of `dotenv` this package calls. */
interface IEnvLoader {
	config(): unknown
}

// dotenv is an optional peer. Top-level await is safe: every `exports` entry has only `import` and `types` conditions,
// so no CommonJS consumer can load this package. One ESM instance, so call sites stay synchronous.
const dotenv = await importOptional('dotenv', () => import('dotenv'))

/**
 * Load the environment file of the current directory into `process.env` when `dotenv` is installed; do nothing when
 * it is not. Call it once at module scope, after the imports, where `dotenv.config()` used to run.
 *
 * @param loader replaces `dotenv`; `null` stands for "not installed"
 */
export function loadEnv(loader: IEnvLoader | null = dotenv): void {
	loader?.config()
}
