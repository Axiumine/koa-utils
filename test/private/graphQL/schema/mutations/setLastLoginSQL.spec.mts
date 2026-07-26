/**
 * Tests for private/graphQL/schema/mutations/setLastLoginSQL.mts
 *
 * Chain: setLastLoginSQL → sequelize.query (UPDATE user SET lastlogin ...)
 * fail → Sentry.captureException → resolve false, no throw
 */
import { setLastLoginSQL } from '@private/graphQL/schema/mutations/setLastLoginSQL.mjs'
import { sequelize } from '@dataSources/MariaDB.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

describe('setLastLoginSQL', () => {
	afterEach(() => {
		sinon.restore()
	})

	it('happy path: runs the UPDATE query and resolves true', async () => {
		const queryStub = sinon.stub(sequelize, 'query').resolves()

		const result = await setLastLoginSQL(42)

		expect(result).to.equal(true)
		expect(queryStub.calledOnce).to.equal(true)
		expect(queryStub.firstCall.args[0]).to.equal('UPDATE user SET lastlogin = :timestamp WHERE id = :id')
		const options = queryStub.firstCall.args[1] as { replacements: { timestamp: string; id: number } }
		expect(options.replacements.id).to.equal(42)
		expect(options.replacements.timestamp).to.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
	})

	// Sentry.captureException not stubbable — '@sentry/node' is a sealed ES module namespace ("ES Modules
	// cannot be stubbed"), same limitation documented in tryCatchRethrow.spec.mts. Sentry never init'd in the
	// suite → the real call is a safe no-op. Catch block contract: swallow the error, return false.
	it('query rejection: swallows the error and resolves false', async () => {
		sinon.stub(sequelize, 'query').rejects(new Error('sql down'))

		const result = await setLastLoginSQL(7)

		expect(result).to.equal(false)
	})
})
