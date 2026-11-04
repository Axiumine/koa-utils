import { RoleAssertionError } from '@lib/PostgreSQL/error/RoleAssertionError.mjs'
import { rolePlan } from '@private/lib/PostgreSQL/rolePlan.mjs'
import { expect } from 'chai'

// plan from options, or INVALID_EXPECTATION. Pool never touched here. Each wrong shape also covered via assertRole

function invalidOf(options: unknown): RoleAssertionError {
	try {
		rolePlan(options)
	} catch (error) {
		expect(error).to.be.instanceOf(RoleAssertionError)
		return error as RoleAssertionError
	}
	throw new Error('rolePlan did not throw')
}

describe('rolePlan', () => {
	it('reads the role, the checks in the order of the list and the allowed memberships', () => {
		const plan = rolePlan({
			expectedRole: 'app_role',
			expectedGrants: [
				{ object: 'app', privilege: 'USAGE' },
				{ object: 'app.t', privilege: 'SELECT' }
			],
			allowedMemberships: ['owner_role', 'reader_role']
		})
		expect(plan.role).to.equal('app_role')
		expect(plan.checks).to.deep.equal([
			{ kind: 'schema', object: 'app', privilege: 'USAGE' },
			{ kind: 'relation', object: 'app.t', privilege: 'SELECT' }
		])
		expect([...plan.allowed]).to.deep.equal(['owner_role', 'reader_role'])
	})

	it('allows no membership when none is given', () => {
		const plan = rolePlan({ expectedRole: 'app_role', expectedGrants: [] })
		expect(plan.allowed.size).to.equal(0)
		expect(plan.checks).to.deep.equal([])
	})

	it('throws INVALID_EXPECTATION naming the role when the role is fine and a grant is not', () => {
		const error = invalidOf({ expectedRole: 'app_role', expectedGrants: [{ object: 'a.b.c', privilege: 'SELECT' }] })
		expect(error.reason).to.equal('INVALID_EXPECTATION')
		expect(error.role).to.equal('app_role')
	})

	it('throws INVALID_EXPECTATION with ? as the role when the role is not a plain name', () => {
		for (const options of [
			undefined,
			null,
			'app_role',
			5,
			{},
			{ expectedRole: 5 },
			{ expectedRole: 'a b', expectedGrants: [] }
		]) {
			const error = invalidOf(options)
			expect(error.reason).to.equal('INVALID_EXPECTATION')
			expect(error.role).to.equal('?')
		}
	})

	it('throws when the grants are not a list, or the memberships are not a list of names', () => {
		invalidOf({ expectedRole: 'app_role' })
		invalidOf({ expectedRole: 'app_role', expectedGrants: {} })
		invalidOf({ expectedRole: 'app_role', expectedGrants: [], allowedMemberships: 'x' })
		invalidOf({ expectedRole: 'app_role', expectedGrants: [], allowedMemberships: [1] })
		invalidOf({ expectedRole: 'app_role', expectedGrants: [], allowedMemberships: null })
	})

	it('throws at the first bad grant, whatever follows it', () => {
		invalidOf({
			expectedRole: 'app_role',
			expectedGrants: [{ object: 'app', privilege: 'USAGE' }, null, { object: 'app', privilege: 'USAGE' }]
		})
	})
})
