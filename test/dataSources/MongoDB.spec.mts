import { expect } from 'chai'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import sinon from 'sinon'

// mongoose.connect / mongoose.disconnect non-stubbable in ESM (live bindings non-configurable) → test
// module shape + exported members, drive error paths against a bad URI.

describe('MongoDB', () => {
	it('exports MongoDBConnect as an async function', async () => {
		const mod = await import('../../dist/dataSources/MongoDB.mjs')
		expect(mod.MongoDBConnect).to.be.a('function')
	})

	it('exports MongoDBDisconnect as an async function', async () => {
		const mod = await import('../../dist/dataSources/MongoDB.mjs')
		expect(mod.MongoDBDisconnect).to.be.a('function')
	})

	it('MongoDBConnect rejects when MONGODB_URI is invalid', async () => {
		const { MongoDBConnect } = await import('../../dist/dataSources/MongoDB.mjs')
		// URI missing or invalid → mongoose throw/reject
		let caught: unknown
		try {
			await MongoDBConnect()
		} catch (e) {
			caught = e
		}
		// assert it threw only — exact message vary by mongoose version
		expect(caught).to.exist
	})

	it('MongoDBDisconnect runs without a live connection (idempotent)', async () => {
		const { MongoDBDisconnect } = await import('../../dist/dataSources/MongoDB.mjs')
		// mongoose.disconnect() safe with no open conn → resolve silently
		await MongoDBDisconnect()
	})
})

describe('MongoDB against an in-memory server', () => {
	const modUrl = new URL('../../dist/dataSources/MongoDB.mjs', import.meta.url)
	let server: MongoMemoryServer
	let savedUri: string | undefined
	let infoSpy: sinon.SinonSpy
	let savedSanitize: unknown
	let savedStrict: unknown

	before(async () => {
		server = await MongoMemoryServer.create()
	})

	after(async () => {
		await server.stop()
	})

	beforeEach(() => {
		savedUri = process.env['MONGODB_URI']
		savedSanitize = mongoose.get('sanitizeFilter')
		savedStrict = mongoose.get('strictQuery')
		process.env['MONGODB_URI'] = server.getUri()
		infoSpy = sinon.spy(console, 'info')
	})

	afterEach(async () => {
		infoSpy.restore()
		await mongoose.disconnect()
		if (savedUri === undefined) delete process.env['MONGODB_URI']
		else process.env['MONGODB_URI'] = savedUri
		mongoose.set('sanitizeFilter', savedSanitize as boolean)
		mongoose.set('strictQuery', savedStrict as boolean)
	})

	it('MongoDBConnect connects to MONGODB_URI with the pinned options and logs both messages', async () => {
		// preset opposite values → prove MongoDBConnect itself sets them
		mongoose.set('sanitizeFilter', false)
		mongoose.set('strictQuery', true)
		const { MongoDBConnect } = await import(modUrl.href)
		await MongoDBConnect()

		expect(mongoose.connection.readyState).to.equal(1)
		expect(mongoose.get('sanitizeFilter')).to.equal(true)
		expect(mongoose.get('strictQuery')).to.equal(false)
		expect(mongoose.connection.config.autoIndex).to.equal(true)
		const clientOptions = mongoose.connection.getClient().options
		expect(clientOptions.family).to.equal(4)
		expect(clientOptions.serverSelectionTimeoutMS).to.equal(5000)
		expect(infoSpy.args).to.deep.equal([
			['[MongoDB] Try connect to database... '],
			['[MongoDB] OK: MongoDB connection has been established successfully. ']
		])
	})

	it('MongoDBDisconnect closes the open connection and logs both messages', async () => {
		const { MongoDBConnect, MongoDBDisconnect } = await import(modUrl.href)
		await MongoDBConnect()
		infoSpy.resetHistory()
		await MongoDBDisconnect()

		expect(mongoose.connection.readyState).to.equal(0)
		expect(infoSpy.args).to.deep.equal([
			['[MongoDB] Try close connection to database... '],
			['[MongoDB] OK: MongoDB connection has been closed successfully.']
		])
	})

	it('importing the module loads the env file from the working directory (dotenv.config)', async () => {
		const key = 'KOA_UTILS_MUTATION_DOTENV_PROBE'
		const dir = mkdtempSync(join(tmpdir(), 'koa-utils-dotenv-'))
		const cwd = process.cwd()
		writeFileSync(join(dir, '.env'), `${key}=loaded\n`)
		try {
			process.chdir(dir)
			// fresh module instance → module body (dotenv.config) runs again
			await import(`${modUrl.href}?dotenv-probe=${Date.now()}`)
			expect(process.env[key]).to.equal('loaded')
		} finally {
			process.chdir(cwd)
			delete process.env[key]
			rmSync(dir, { recursive: true, force: true })
		}
	})
})
