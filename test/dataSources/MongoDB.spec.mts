import { expect } from 'chai'

// mongoose.connect / mongoose.disconnect are non-stubbable in ESM (live bindings are non-configurable).
// We test module shape + expected exported members, and exercise error paths against a bad URI.

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
		// mongoose will throw/reject when URI is missing or invalid
		let caught: unknown
		try {
			await MongoDBConnect()
		} catch (e) {
			caught = e
		}
		// We only assert that it threw — exact message varies by mongoose version
		expect(caught).to.exist
	})

	it('MongoDBDisconnect runs without a live connection (idempotent)', async () => {
		const { MongoDBDisconnect } = await import('../../dist/dataSources/MongoDB.mjs')
		// mongoose.disconnect() is safe to call when no connection is open; it resolves silently
		await MongoDBDisconnect()
	})
})
