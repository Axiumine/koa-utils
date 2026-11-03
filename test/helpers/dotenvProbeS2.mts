/**
 * dotenv probe — prove a dist module call `dotenv.config()` at import time.
 *
 * `dotenv.config()` read `<cwd>/.env`. Probe: temp dir holding `.env` with 1 unique var, `chdir` there,
 * re-evaluate module via cache-busting query string, read var from `process.env`, restore cwd + env.
 * Module body re-run on each distinct query → `dotenv.config()` run again. Imports of the module's own
 * deps stay cached → no other side effect.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

let seq = 0

/**
 * @param distModuleAbsPath absolute path of built `.mjs` module
 * @returns value `dotenv` put in `process.env` while module re-evaluated, `undefined` if never loaded
 */
export async function envLoadedByImport(distModuleAbsPath: string): Promise<string | undefined> {
	const key = `KOA_UTILS_DOTENV_PROBE_${process.pid}_${seq++}`
	const dir = mkdtempSync(path.join(os.tmpdir(), 'dotenv-probe-'))
	const prevCwd = process.cwd()
	try {
		writeFileSync(path.join(dir, '.env'), `${key}=loaded\n`)
		process.chdir(dir)
		await import(`${pathToFileURL(distModuleAbsPath).href}?dotenvProbe=${key}`)
		return process.env[key]
	} finally {
		process.chdir(prevCwd)
		delete process.env[key]
		rmSync(dir, { recursive: true, force: true })
	}
}
