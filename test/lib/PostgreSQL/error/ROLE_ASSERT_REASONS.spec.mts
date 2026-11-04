import { ROLE_ASSERT_REASONS } from '@lib/PostgreSQL/error/ROLE_ASSERT_REASONS.mjs'
import { expect } from 'chai'

describe('ROLE_ASSERT_REASONS', () => {
	it('lists the twelve closed reasons, in the order the checks run', () => {
		expect([...ROLE_ASSERT_REASONS]).to.deep.equal([
			'INVALID_EXPECTATION',
			'ROLE_MISMATCH',
			'ROLE_SUPERUSER',
			'ROLE_CREATEROLE',
			'ROLE_CREATEDB',
			'ROLE_BYPASSRLS',
			'ROLE_REPLICATION',
			'ROLE_OWNS_OBJECTS',
			'ROLE_MEMBERSHIP',
			'SESSION_ROLE_DIFFERS',
			'GRANT_MISSING',
			'CHECK_FAILED'
		])
		expect(new Set(ROLE_ASSERT_REASONS).size).to.equal(ROLE_ASSERT_REASONS.length)
	})
})
