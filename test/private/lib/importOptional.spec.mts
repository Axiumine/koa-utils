/**
 * importOptional → optional peer loader. null only when `specifier` itself missing, else rethrow.
 *
 * Real `import()` of absent + half-installed pkg → pin actual Node error shape. Fake errors → pin each
 * clause of the match (code, message type, quoted name), 1 case per clause → no mutant survive.
 */
import { importOptional } from '@private/lib/importOptional.mjs'
import { expect } from 'chai'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// error shaped like Node resolver error, fields overridable per case
const resolverError = (fields: { code?: unknown; message?: unknown }): Error =>
	Object.assign(new Error(), { code: 'ERR_MODULE_NOT_FOUND', message: "Cannot find package 'peer-x' imported from /app/a.mjs" }, fields)

// load rejects with `reason` → resolves to what importOptional rejected with
const rejectionOf = async (reason: unknown): Promise<unknown> => {
	try {
		await importOptional('peer-x', () => Promise.reject(reason))
	} catch (e) {
		return e
	}
	throw new Error('importOptional resolved, expected rejection')
}

describe('importOptional', () => {
	it('resolves the loaded module as is', async () => {
		const mod = { config: () => 1 }
		expect(await importOptional('peer-x', () => Promise.resolve(mod))).to.equal(mod)
	})

	it('calls load exactly once', async () => {
		let calls = 0
		await importOptional('peer-x', () => {
			calls++
			return Promise.resolve({})
		})
		expect(calls).to.equal(1)
	})

	it('resolves null for a package that is really not installed (real import)', async () => {
		const name = 'koa-utils-surely-not-installed'
		expect(await importOptional(name, () => import(name))).to.equal(null)
	})

	it('rethrows when the package exists but one of ITS deps is missing (real import)', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'import-optional-'))
		try {
			const file = join(dir, 'half-installed.mjs')
			writeFileSync(file, "import 'koa-utils-surely-missing-dep'\n")
			const url = pathToFileURL(file).href
			const err = await importOptional('half-installed', () => import(url)).catch((e: unknown) => e)
			expect(err).to.be.instanceOf(Error)
			expect((err as NodeJS.ErrnoException).code).to.equal('ERR_MODULE_NOT_FOUND')
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	it('resolves null for ERR_MODULE_NOT_FOUND naming the specifier', async () => {
		expect(await importOptional('peer-x', () => Promise.reject(resolverError({})))).to.equal(null)
	})

	it('resolves null for the CommonJS code MODULE_NOT_FOUND naming the specifier', async () => {
		const err = resolverError({ code: 'MODULE_NOT_FOUND', message: "Cannot find module 'peer-x'\nRequire stack:\n- /app/a.cjs" })
		expect(await importOptional('peer-x', () => Promise.reject(err))).to.equal(null)
	})

	it('matches a scoped specifier', async () => {
		const err = resolverError({ message: "Cannot find package '@scope/peer-x' imported from /app/a.mjs" })
		expect(await importOptional('@scope/peer-x', () => Promise.reject(err))).to.equal(null)
	})

	it('rethrows the same error when the missing name is another package', async () => {
		const err = resolverError({ message: "Cannot find package 'other' imported from /app/node_modules/peer-x/index.mjs" })
		expect(await rejectionOf(err)).to.equal(err)
	})

	it('rethrows the same error for another code, even if the message names the specifier', async () => {
		const err = resolverError({ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
		expect(await rejectionOf(err)).to.equal(err)
	})

	it('rethrows the same error when code is missing', async () => {
		const err = resolverError({ code: undefined })
		expect(await rejectionOf(err)).to.equal(err)
	})

	it('rethrows the same error when message is not a string', async () => {
		const err = resolverError({ message: undefined })
		expect(await rejectionOf(err)).to.equal(err)
	})

	it('rethrows a plain error', async () => {
		const err = new Error('boom')
		expect(await rejectionOf(err)).to.equal(err)
	})

	it('rethrows non-error reasons untouched (null, undefined, string)', async () => {
		expect(await rejectionOf(null)).to.equal(null)
		expect(await rejectionOf(undefined)).to.equal(undefined)
		expect(await rejectionOf('peer-x')).to.equal('peer-x')
	})
})
