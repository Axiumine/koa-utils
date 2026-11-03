/**
 * Mutation-testing guard for private/graphQL/schema/mutations/setRedisLoginSession.mts
 *
 * Pin: own `dotenv.config()` at import, on top of the one in dataSources/Redis.mjs. dotenv log 1 line
 * per `config()` call → removing the call drop 1 line at load.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect } from 'chai'

// subprocess → fresh module graph. Count dotenv "injected env" log lines at load.
// Stryker activate static mutant via global `__stryker__.activeMutant` in this process only.
// Child start clean → forward id as `__STRYKER_ACTIVE_MUTANT__` (instrumented header read it), else child run original code.
function countInjectedLines(cwd: string, distFile: string): number {
	const url = pathToFileURL(resolve(process.cwd(), distFile)).href
	const active = (globalThis as { __stryker__?: { activeMutant?: string } }).__stryker__?.activeMutant
	const env: Record<string, string> = { PATH: process.env['PATH'] ?? '' }
	if (active !== undefined) {
		env['__STRYKER_ACTIVE_MUTANT__'] = String(active)
	}
	const res = spawnSync(
		process.execPath,
		['--input-type=module', '-e', `await import(${JSON.stringify(url)}); process.exit(0)`],
		{
			cwd,
			encoding: 'utf8',
			env
		}
	)
	const out = `${res.stdout}\n${res.stderr}`
	return out.split('\n').filter((l) => l.includes('injected env')).length
}

describe('setRedisLoginSession — mutation guards', () => {
	it('runs its own dotenv.config() on top of the one in Redis.mjs', () => {
		const dir = mkdtempSync(join(tmpdir(), 'dotenv-audit-'))
		try {
			writeFileSync(join(dir, '.env'), 'AUDIT_DOTENV_PROBE=1\n')
			const base = countInjectedLines(dir, 'dist/dataSources/Redis.mjs')
			const withSession = countInjectedLines(dir, 'dist/private/graphQL/schema/mutations/setRedisLoginSession.mjs')
			expect(base).to.be.greaterThan(0)
			expect(withSession).to.equal(base + 1)
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})
})
