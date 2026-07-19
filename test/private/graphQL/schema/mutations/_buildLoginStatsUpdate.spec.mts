/**
 * Tests for private/graphQL/schema/mutations/_buildLoginStatsUpdate.mts
 *
 * Pure helper — no collaborators to stub. Builds the $set / $unset payloads
 * used by the login mutations to record login stats + rememberMe flag.
 */
import { _buildLoginStatsUpdate } from '@private/graphQL/schema/mutations/_buildLoginStatsUpdate.mjs'
import { expect } from 'chai'

// ---------------------------------------------------------------------------

describe('_buildLoginStatsUpdate', () => {
	it('lastLogin === null and rememberMe === true → sets firstLogin + lastLogin + rememberMe, no unset', () => {
		const { dbSet, dbUnset } = _buildLoginStatsUpdate(null, true)

		expect(dbSet).to.have.property('login.lastLogin').that.is.instanceOf(Date)
		expect(dbSet).to.have.property('login.firstLogin').that.is.instanceOf(Date)
		expect(dbSet).to.have.property('account.rememberMe', true)
		expect(dbUnset).to.not.have.property('account.rememberMe')
	})

	it('lastLogin === null and rememberMe === false → sets firstLogin + lastLogin, unsets rememberMe', () => {
		const { dbSet, dbUnset } = _buildLoginStatsUpdate(null, false)

		expect(dbSet).to.have.property('login.lastLogin').that.is.instanceOf(Date)
		expect(dbSet).to.have.property('login.firstLogin').that.is.instanceOf(Date)
		expect(dbSet).to.not.have.property('account.rememberMe')
		expect(dbUnset).to.have.property('account.rememberMe', 1)
	})

	it('lastLogin is a past Date and rememberMe === true → sets lastLogin + rememberMe, no firstLogin, no unset', () => {
		const previousLogin = new Date('2020-01-01T00:00:00.000Z')
		const { dbSet, dbUnset } = _buildLoginStatsUpdate(previousLogin, true)

		expect(dbSet).to.have.property('login.lastLogin').that.is.instanceOf(Date)
		expect(dbSet).to.not.have.property('login.firstLogin')
		expect(dbSet).to.have.property('account.rememberMe', true)
		expect(dbUnset).to.not.have.property('account.rememberMe')
	})

	it('lastLogin is a past Date and rememberMe === false → sets lastLogin only, unsets rememberMe, no firstLogin', () => {
		const previousLogin = new Date('2020-01-01T00:00:00.000Z')
		const { dbSet, dbUnset } = _buildLoginStatsUpdate(previousLogin, false)

		expect(dbSet).to.have.property('login.lastLogin').that.is.instanceOf(Date)
		expect(dbSet).to.not.have.property('login.firstLogin')
		expect(dbSet).to.not.have.property('account.rememberMe')
		expect(dbUnset).to.have.property('account.rememberMe', 1)
	})
})
