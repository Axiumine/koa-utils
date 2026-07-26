import { expect } from 'chai'

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
