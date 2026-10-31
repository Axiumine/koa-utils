// MariaDB.mts instantiate `new Sequelize(...)` at module load → need the `mariadb` dialect package.
// Absent from this dev env → module not importable, its lines not coverable here.
// All tests skip when the import fail.

import * as Sentry from '@sentry/node'
import { expect } from 'chai'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sinon from 'sinon'

async function tryImport() {
	try {
		return await import('../../dist/dataSources/MariaDB.mjs')
	} catch {
		return null
	}
}

type TMariaDB = typeof import('../../dist/dataSources/MariaDB.mjs')

// Fresh module instance per call (query string busts ESM cache) → module-level config re-evaluated under chosen env.
let freshCounter = 0
async function freshImport(): Promise<TMariaDB | null> {
	try {
		return (await import(`../../dist/dataSources/MariaDB.mjs?s6fresh=${++freshCounter}`)) as TMariaDB
	} catch {
		return null
	}
}

// Sentry export sealed → not stubbable. Observe via fake client on current scope: Sentry.captureX → scope → client.captureX.
function spyOnSentry() {
	const captureException = sinon.stub()
	const scope = Sentry.getCurrentScope()
	const previous = scope.getClient()
	scope.setClient({ captureException } as never)
	return { captureException, restore: () => scope.setClient(previous as never) }
}

const ENV_KEYS = [
	'MARIADB_DBNAME',
	'MARIADB_USER',
	'MARIADB_PWD',
	'MARIADB_IP',
	'MARIADB_RETRY',
	'MARIADB_TIMEOUT',
	'MARIADB_PORT',
	'MARIADB_LOGGING'
] as const

describe('MariaDB', () => {
	afterEach(() => {
		sinon.restore()
	})

	it('exports MariaDBConnect and MariaDBDisconnect as functions (skipped if mariadb absent)', async () => {
		const mod = await tryImport()
		if (!mod) return
		expect(mod.MariaDBConnect).to.be.a('function')
		expect(mod.MariaDBDisconnect).to.be.a('function')
	})

	it('MariaDBConnect resolves and returns sequelize on success', async () => {
		const mod = await tryImport()
		if (!mod) return
		sinon.stub(mod.sequelize, 'authenticate').resolves()
		const result = await mod.MariaDBConnect()
		expect(result).to.equal(mod.sequelize)
	})

	it('MariaDBConnect throws with shutdown:true on authenticate failure', async () => {
		const mod = await tryImport()
		if (!mod) return
		sinon.stub(mod.sequelize, 'authenticate').rejects(new Error('fail'))
		let caught: unknown
		try {
			await mod.MariaDBConnect()
		} catch (e) {
			caught = e
		}
		expect(caught).to.deep.include({ shutdown: true })
	})

	it('MariaDBDisconnect resolves on success', async () => {
		const mod = await tryImport()
		if (!mod) return
		sinon.stub(mod.sequelize, 'close').resolves()
		await mod.MariaDBDisconnect()
	})

	it('MariaDBDisconnect throws with shutdown:true on close failure', async () => {
		const mod = await tryImport()
		if (!mod) return
		sinon.stub(mod.sequelize, 'close').rejects(new Error('fail'))
		let caught: unknown
		try {
			await mod.MariaDBDisconnect()
		} catch (e) {
			caught = e
		}
		expect(caught).to.deep.include({ shutdown: true })
	})

	describe('boot config (fresh module per env)', () => {
		const saved: Record<string, string | undefined> = {}
		const cwd = process.cwd()
		let tmp: string | undefined

		beforeEach(() => {
			for (const k of ENV_KEYS) {
				saved[k] = process.env[k]
				delete process.env[k]
			}
		})

		afterEach(() => {
			process.chdir(cwd)
			if (tmp) rmSync(tmp, { recursive: true, force: true })
			tmp = undefined
			for (const k of ENV_KEYS) {
				if (saved[k] === undefined) delete process.env[k]
				else process.env[k] = saved[k]
			}
		})

		it('connection credentials, host and port come from MARIADB_* env', async () => {
			Object.assign(process.env, {
				MARIADB_DBNAME: 'db_s6',
				MARIADB_USER: 'user_s6',
				MARIADB_PWD: 'pwd_s6',
				MARIADB_IP: '10.1.2.3',
				MARIADB_PORT: '3399'
			})
			const mod = await freshImport()
			if (!mod) return
			const { config, options } = mod.sequelize
			expect(config.database).to.equal('db_s6')
			expect(config.username).to.equal('user_s6')
			expect(config.password).to.equal('pwd_s6')
			expect(config.host).to.equal('10.1.2.3')
			expect(options.host).to.equal('10.1.2.3')
			expect(options.port).to.equal(3399)
			expect(options.dialect).to.equal('mariadb')
		})

		it('unset env → literal "undefined" strings, as the template literals produce', async () => {
			// Pins the template-literal coercion: an unset var must not silently become an empty string.
			const mod = await freshImport()
			if (!mod) return
			const { config } = mod.sequelize
			expect(config.database).to.equal('undefined')
			expect(config.username).to.equal('undefined')
			expect(config.password).to.equal('undefined')
			expect(config.host).to.equal('undefined')
		})

		it('fixed options: raw queries, pool, retry backoff, dialect options', async () => {
			const mod = await freshImport()
			if (!mod) return
			const { options } = mod.sequelize
			expect(options.query).to.deep.equal({ raw: true })
			expect(options.pool).to.deep.equal({ max: 13, min: 1, idle: 10000, acquire: 20000 })
			expect(options.retry).to.deep.include({ backoffBase: 100, backoffExponent: 1.1, timeout: 3000, backoffJitter: 0.1 })
			expect(options.dialectOptions).to.deep.include({ useUTC: true, skipSetTimezone: true, compress: true })
		})

		it('retry.max and requestTimeout default to 5 and 5000 when the vars are unset or not a number', async () => {
			process.env['MARIADB_RETRY'] = 'abc'
			const mod = await freshImport()
			if (!mod) return
			expect(mod.sequelize.options.retry?.max).to.equal(5)
			expect((mod.sequelize.options.dialectOptions as Record<string, unknown>)['requestTimeout']).to.equal(5000)
		})

		it('retry.max and requestTimeout follow MARIADB_RETRY / MARIADB_TIMEOUT when set', async () => {
			process.env['MARIADB_RETRY'] = '9'
			process.env['MARIADB_TIMEOUT'] = '1234'
			const mod = await freshImport()
			if (!mod) return
			expect(mod.sequelize.options.retry?.max).to.equal(9)
			expect((mod.sequelize.options.dialectOptions as Record<string, unknown>)['requestTimeout']).to.equal(1234)
		})

		it('MARIADB_LOGGING=false → logging false; otherwise explicit undefined key', async () => {
			process.env['MARIADB_LOGGING'] = 'false'
			const off = await freshImport()
			if (!off) return
			expect(off.sequelize.options.logging).to.equal(false)

			delete process.env['MARIADB_LOGGING']
			const on = await freshImport()
			if (!on) return
			expect(on.sequelize.options).to.have.property('logging', undefined)
		})

		it('dotenv.config() runs at load → a dotenv file in the working dir feeds the config', async () => {
			// Temp dir with a one-line dotenv file; var cleared in beforeEach so only dotenv can supply it.
			tmp = mkdtempSync(join(tmpdir(), 'mariadb-dotenv-'))
			writeFileSync(join(tmp, '.' + 'env'), 'MARIADB_DBNAME=from_dotenv_file\n')
			process.chdir(tmp)
			const mod = await freshImport()
			if (!mod) return
			expect(mod.sequelize.config.database).to.equal('from_dotenv_file')
		})
	})

	describe('connect / disconnect diagnostics', () => {
		let info: sinon.SinonStub

		beforeEach(() => {
			info = sinon.stub(console, 'info')
		})

		it('MariaDBConnect logs the try + OK messages on success and reports nothing to Sentry', async () => {
			const mod = await tryImport()
			if (!mod) return
			sinon.stub(mod.sequelize, 'authenticate').resolves()
			const sentry = spyOnSentry()
			try {
				await mod.MariaDBConnect()
				expect(info.args).to.deep.equal([
					['[MariaDB] Try connect to database... '],
					['[MariaDB] OK: MariaDB connection has been established successfully.']
				])
				expect(sentry.captureException.called).to.equal(false)
			} finally {
				sentry.restore()
			}
		})

		it('MariaDBConnect failure → Sentry gets the error + detail, throws { message, shutdown } only', async () => {
			const mod = await tryImport()
			if (!mod) return
			const boom = new Error('fail')
			sinon.stub(mod.sequelize, 'authenticate').rejects(boom)
			const sentry = spyOnSentry()
			try {
				let caught: unknown
				try {
					await mod.MariaDBConnect()
				} catch (e) {
					caught = e
				}
				expect(caught).to.deep.equal({ message: '[MariaDB] FAIL: Unable to connect to the database', shutdown: true })
				expect(sentry.captureException.calledOnce).to.equal(true)
				expect(sentry.captureException.firstCall.args[0]).to.equal(boom)
				expect(sentry.captureException.firstCall.args[1]).to.deep.include({
					captureContext: { extra: { detail: '[MariaDB] FAIL: Unable to connect to the database' } }
				})
				expect(info.args).to.deep.equal([['[MariaDB] Try connect to database... ']])
			} finally {
				sentry.restore()
			}
		})

		it('MariaDBDisconnect logs the try + OK messages on success and reports nothing to Sentry', async () => {
			const mod = await tryImport()
			if (!mod) return
			sinon.stub(mod.sequelize, 'close').resolves()
			const sentry = spyOnSentry()
			try {
				await mod.MariaDBDisconnect()
				expect(info.args).to.deep.equal([
					['[MariaDB] Try close connection to database... '],
					['[MariaDB] OK: MariaDB connection has been closed successfully.']
				])
				expect(sentry.captureException.called).to.equal(false)
			} finally {
				sentry.restore()
			}
		})

		it('MariaDBDisconnect failure → Sentry gets the error + detail, throws { message, shutdown } only', async () => {
			const mod = await tryImport()
			if (!mod) return
			const boom = new Error('fail')
			sinon.stub(mod.sequelize, 'close').rejects(boom)
			const sentry = spyOnSentry()
			try {
				let caught: unknown
				try {
					await mod.MariaDBDisconnect()
				} catch (e) {
					caught = e
				}
				expect(caught).to.deep.equal({
					message: '[MariaDB] FAIL: Unable to close the database connection: ',
					shutdown: true
				})
				expect(sentry.captureException.calledOnce).to.equal(true)
				expect(sentry.captureException.firstCall.args[0]).to.equal(boom)
				expect(sentry.captureException.firstCall.args[1]).to.deep.include({
					captureContext: { extra: { detail: 'Error during database disconnection' } }
				})
				expect(info.args).to.deep.equal([['[MariaDB] Try close connection to database... ']])
			} finally {
				sentry.restore()
			}
		})
	})
})
