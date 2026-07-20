/**
 * Tests for private/graphQL/schema/mutations/infoUserForLoginSQL.mts
 *
 * Chain: infoUserForLoginSQL → sequelize.query (MariaDB) → throwErrorWrongUserInput (throwGraphQLError) on empty result
 */
import { infoUserForLoginSQL } from '@private/graphQL/schema/mutations/infoUserForLoginSQL.mjs'
import { sequelize } from '@dataSources/MariaDB.mjs'
import { QueryTypes } from 'sequelize'
import { expect } from 'chai'
import sinon from 'sinon'

import { expectGraphQLErrorAsync } from '../../../../helpers/assertGraphQLError.mjs'

// ---------------------------------------------------------------------------

describe('infoUserForLoginSQL', () => {
	afterEach(() => {
		sinon.restore()
	})

	it('row found → resolves with ret[0]', async () => {
		const row = { id: 1, password: 'hashed', valid: true, deleted: false, disabled: false }
		const queryStub = sinon.stub(sequelize, 'query').resolves([row] as never)

		const result = await infoUserForLoginSQL('user@test.com')

		expect(result).to.deep.equal(row)
		expect(queryStub.calledOnce).to.equal(true)
		expect(queryStub.firstCall.args[0]).to.equal(
			'SELECT id, password, valid, deleted, disabled FROM user WHERE email=:email'
		)
		expect(queryStub.firstCall.args[1]).to.deep.equal({
			type: QueryTypes.SELECT,
			replacements: { email: 'user@test.com' }
		})
	})

	it('multiple rows found → resolves with the first row only', async () => {
		const rows = [
			{ id: 1, password: 'hashed1', valid: true, deleted: false, disabled: false },
			{ id: 2, password: 'hashed2', valid: true, deleted: false, disabled: false }
		]
		sinon.stub(sequelize, 'query').resolves(rows as never)

		const result = await infoUserForLoginSQL('dup@test.com')

		expect(result).to.deep.equal(rows[0])
	})

	it('no row found → throws 400 Bad Request', async () => {
		sinon.stub(sequelize, 'query').resolves([] as never)

		await expectGraphQLErrorAsync(
			() => infoUserForLoginSQL('missing@test.com'),
			400,
			'Bad Request',
			'User does not exist'
		)
	})
})
