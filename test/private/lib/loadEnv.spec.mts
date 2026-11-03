/**
 * loadEnv → dotenv facade. Real dotenv by default, injected loader for "not installed" (null) + call shape.
 *
 * Load-at-import of each of the 13 modules pinned in their own specs (dotenvProbe*). Here: facade itself.
 */
import { loadEnv } from '@private/lib/loadEnv.mjs'
import { expect } from 'chai'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sinon from 'sinon'

describe('loadEnv', () => {
	it('default loader = real dotenv: reads the env file of cwd into process.env', () => {
		const key = `KOA_UTILS_LOAD_ENV_${process.pid}`
		const dir = mkdtempSync(join(tmpdir(), 'load-env-'))
		const prevCwd = process.cwd()
		try {
			writeFileSync(join(dir, '.env'), `${key}=from-file\n`)
			process.chdir(dir)
			loadEnv()
			expect(process.env[key]).to.equal('from-file')
		} finally {
			process.chdir(prevCwd)
			delete process.env[key]
			rmSync(dir, { recursive: true, force: true })
		}
	})

	it('calls config() of the given loader once, no argument', () => {
		const config = sinon.stub()
		loadEnv({ config })
		expect(config.calledOnceWithExactly()).to.equal(true)
	})

	it('returns nothing, whatever config() returns', () => {
		expect(loadEnv({ config: () => ({ parsed: { A: '1' } }) })).to.equal(undefined)
	})

	it('null = dotenv not installed → no-op, no throw', () => {
		expect(() => loadEnv(null)).to.not.throw()
		expect(loadEnv(null)).to.equal(undefined)
	})
})
