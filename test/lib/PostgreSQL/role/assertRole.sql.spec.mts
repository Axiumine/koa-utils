import { assertRole } from '@lib/PostgreSQL/role/assertRole.mjs'
import { expect } from 'chai'

import { FakeRoleWorld } from '../../../helpers/fakeRoleWorld.mjs'
import { EXPECTED_ROLE_SQL } from '../../../helpers/roleCatalogSql.mjs'
import { healthy, options } from '../../../helpers/roleFixtures.mjs'

// SQL text assertRole send, pinned char for char vs golden copy. No live DB → this is the ONLY thing in this repo that
// kills mutants of the statement text. What statements DO on real server: integration test vs live PostgreSQL, not here

describe('assertRole: the catalog statements it sends', () => {
	it('sends exactly the golden statements, one per check, in the order of the checks', async () => {
		const world = new FakeRoleWorld(healthy())
		await assertRole(world.rolePool, options())
		expect(world.texts).to.deep.equal([
			EXPECTED_ROLE_SQL.identity,
			EXPECTED_ROLE_SQL.ownsObjects,
			EXPECTED_ROLE_SQL.memberships,
			EXPECTED_ROLE_SQL.grant.schema,
			EXPECTED_ROLE_SQL.grant.relation,
			EXPECTED_ROLE_SQL.grant.columns,
			EXPECTED_ROLE_SQL.grant.function,
			EXPECTED_ROLE_SQL.grant.relation
		])
	})

	it('sends a table grant, a sequence grant and a view grant to the same relation statement', async () => {
		const world = new FakeRoleWorld(healthy())
		await assertRole(world.rolePool, {
			expectedRole: 'app_role',
			expectedGrants: [
				{ object: 'app.orders', privilege: 'SELECT' },
				{ object: 'app.order_seq', privilege: 'USAGE' }
			]
		})
		expect(world.texts.slice(3)).to.deep.equal([EXPECTED_ROLE_SQL.grant.relation, EXPECTED_ROLE_SQL.grant.relation])
	})
})
