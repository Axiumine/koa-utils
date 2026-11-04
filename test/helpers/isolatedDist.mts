/**
 * Isolated dist — run built modules where an optional peer is REALLY not installed.
 *
 * Copy dist files into temp dir with no `node_modules` above it → bare `import('dotenv')` fail with Node's own
 * ERR_MODULE_NOT_FOUND. No mock, no resolve hook → same error shape a consumer without the peer gets.
 * Copy are built files of current run (Stryker sandbox: the mutated ones) → mutant in specifier match die here.
 */
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface IIsolatedDist {
	/** `file://` URL of the copy of dist file `rel` (path under `dist/`, e.g. `private/lib/loadEnv.mjs`). */
	urlOf(rel: string): string
	/** Delete the temp dir. */
	cleanup(): void
}

/** @param rels dist files to copy, keep their relative layout (relative imports between them keep working) */
export function copyDistToTemp(rels: string[]): IIsolatedDist {
	const dir = mkdtempSync(join(tmpdir(), 'isolated-dist-'))
	for (const rel of rels) {
		const target = join(dir, rel)
		mkdirSync(dirname(target), { recursive: true })
		copyFileSync(resolve(process.cwd(), 'dist', rel), target)
	}
	return {
		urlOf: (rel) => pathToFileURL(join(dir, rel)).href,
		cleanup: () => rmSync(dir, { recursive: true, force: true })
	}
}
