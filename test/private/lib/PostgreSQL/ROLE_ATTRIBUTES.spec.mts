import { ROLE_ASSERT_REASONS } from '@lib/PostgreSQL/error/ROLE_ASSERT_REASONS.mjs'
import { ROLE_ATTRIBUTES } from '@private/lib/PostgreSQL/ROLE_ATTRIBUTES.mjs'
import { expect } from 'chai'

describe('ROLE_ATTRIBUTES', () => {
	it('pairs each flag of the identity row with its reason, in the order they are tested', () => {
		expect(ROLE_ATTRIBUTES.map((pair) => [...pair])).to.deep.equal([
			['superuser', 'ROLE_SUPERUSER'],
			['createrole', 'ROLE_CREATEROLE'],
			['createdb', 'ROLE_CREATEDB'],
			['bypassrls', 'ROLE_BYPASSRLS'],
			['replication', 'ROLE_REPLICATION']
		])
	})

	it('names only reasons of the closed list', () => {
		for (const [, reason] of ROLE_ATTRIBUTES) expect(ROLE_ASSERT_REASONS).to.include(reason)
	})
})
