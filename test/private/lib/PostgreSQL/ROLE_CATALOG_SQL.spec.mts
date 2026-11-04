import { ROLE_CATALOG_SQL } from '@private/lib/PostgreSQL/ROLE_CATALOG_SQL.mjs'
import { expect } from 'chai'

import { EXPECTED_ROLE_SQL } from '../../../helpers/roleCatalogSql.mjs'

// src text vs golden copy, char for char. Edit statement → spec red until golden edited too (on purpose: SQL change =
// reviewed change). Real behaviour on real server not provable here

// highest $n in a text = number of values it needs
function placeholders(text: string): number {
	return Math.max(0, ...[...text.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])))
}

describe('ROLE_CATALOG_SQL', () => {
	it('is the golden text, statement by statement', () => {
		expect(ROLE_CATALOG_SQL.identity).to.equal(EXPECTED_ROLE_SQL.identity)
		expect(ROLE_CATALOG_SQL.ownsObjects).to.equal(EXPECTED_ROLE_SQL.ownsObjects)
		expect(ROLE_CATALOG_SQL.memberships).to.equal(EXPECTED_ROLE_SQL.memberships)
		expect(ROLE_CATALOG_SQL.grant.schema).to.equal(EXPECTED_ROLE_SQL.grant.schema)
		expect(ROLE_CATALOG_SQL.grant.function).to.equal(EXPECTED_ROLE_SQL.grant.function)
		expect(ROLE_CATALOG_SQL.grant.relation).to.equal(EXPECTED_ROLE_SQL.grant.relation)
		expect(ROLE_CATALOG_SQL.grant.columns).to.equal(EXPECTED_ROLE_SQL.grant.columns)
	})

	it('has no other statement than the golden ones', () => {
		expect(Object.keys(ROLE_CATALOG_SQL)).to.deep.equal(Object.keys(EXPECTED_ROLE_SQL))
		expect(Object.keys(ROLE_CATALOG_SQL.grant)).to.deep.equal(Object.keys(EXPECTED_ROLE_SQL.grant))
	})

	it('binds as many values as the code passes: none for the role statements, 2 or 3 for the grants', () => {
		expect(
			[ROLE_CATALOG_SQL.identity, ROLE_CATALOG_SQL.ownsObjects, ROLE_CATALOG_SQL.memberships].map(placeholders)
		).to.deep.equal([0, 0, 0])
		expect(placeholders(ROLE_CATALOG_SQL.grant.schema)).to.equal(2)
		expect(placeholders(ROLE_CATALOG_SQL.grant.function)).to.equal(2)
		expect(placeholders(ROLE_CATALOG_SQL.grant.relation)).to.equal(2)
		expect(placeholders(ROLE_CATALOG_SQL.grant.columns)).to.equal(3)
	})

	it('asks the catalog about current_user only, and every statement is one read with no semicolon', () => {
		const texts = [
			ROLE_CATALOG_SQL.identity,
			ROLE_CATALOG_SQL.ownsObjects,
			ROLE_CATALOG_SQL.memberships,
			...Object.values(ROLE_CATALOG_SQL.grant)
		]
		for (const text of texts) {
			expect(text).to.contain('current_user')
			expect(text).to.not.contain(';')
			expect(text.trimStart()).to.match(/^(SELECT|WITH RECURSIVE) /)
		}
	})
})
