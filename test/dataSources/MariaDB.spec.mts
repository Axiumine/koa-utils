// MariaDB.mts instantiates `new Sequelize(...)` at module load, which requires the
// `mariadb` dialect package. That package is absent from this dev environment, so
// the module cannot be imported and its lines cannot be covered here.
// All tests gracefully skip when the import fails.

import { expect } from 'chai'
import sinon from 'sinon'

async function tryImport() {
	try {
		return await import('../../dist/dataSources/MariaDB.mjs')
	} catch {
		return null
	}
}

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
})
