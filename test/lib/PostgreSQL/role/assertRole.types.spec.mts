import { RoleAssertionError } from '@lib/PostgreSQL/error/RoleAssertionError.mjs'
import { assertRole } from '@lib/PostgreSQL/role/assertRole.mjs'
import type { IAssertRoleOptions } from '@lib/PostgreSQL/role/IAssertRoleOptions.mjs'
import type { IRoleAssertion } from '@lib/PostgreSQL/role/IRoleAssertion.mjs'
import type { IRoleGrant } from '@lib/PostgreSQL/role/IRoleGrant.mjs'
import type { IRolePool } from '@lib/PostgreSQL/role/IRolePool.mjs'
import type { ITxClient } from '@lib/PostgreSQL/tx/ITxClient.mjs'
import { expect } from 'chai'
import pg from 'pg'

// type test. Each @ts-expect-error line fail `yarn typecheck:tests` once line below start to compile.
// Fns holding them never called. build:tests is noCheck → only that gate prove it

// compiled, never run. options: role + grants required, memberships optional, columns a list of strings
function optionsAreChecked(): void {
	const minimal: IAssertRoleOptions = { expectedRole: 'app_role', expectedGrants: [] }
	const full: IAssertRoleOptions = {
		expectedRole: 'app_role',
		expectedGrants: [{ object: 'app.t', privilege: 'SELECT', columns: ['a'] }],
		allowedMemberships: ['owner_role']
	}
	void [minimal, full]
	// @ts-expect-error -- expectedRole is required
	const noRole: IAssertRoleOptions = { expectedGrants: [] }
	// @ts-expect-error -- expectedGrants is required: an empty list says "no grants", missing says nothing
	const noGrants: IAssertRoleOptions = { expectedRole: 'app_role' }
	// @ts-expect-error -- columns is a list, not one name
	const badColumns: IRoleGrant = { object: 'app.t', privilege: 'SELECT', columns: 'a' }
	// @ts-expect-error -- privilege is required
	const noPrivilege: IRoleGrant = { object: 'app.t' }
	void [noRole, noGrants, badColumns, noPrivilege]
}

// compiled, never run. pool: connect + end, nothing less
function poolIsChecked(pool: pg.Pool, client: ITxClient): void {
	const real: IRolePool = pool
	const structural: IRolePool = { connect: () => Promise.resolve(client), end: () => Promise.resolve() }
	void [real, structural]
	// @ts-expect-error -- no end: assertRole closes the pool on failure
	const noEnd: IRolePool = { connect: () => Promise.resolve(client) }
	// @ts-expect-error -- no connect
	const noConnect: IRolePool = { end: () => Promise.resolve() }
	void [noEnd, noConnect]
}

// compiled, never run. answer typed, error constructor takes closed reasons only
async function answerIsTyped(pool: IRolePool): Promise<IRoleAssertion> {
	const answer = await assertRole(pool, { expectedRole: 'app_role', expectedGrants: [] })
	// @ts-expect-error -- answer has role and grantsChecked, nothing else
	void answer.pool
	// @ts-expect-error -- not a closed reason
	void new RoleAssertionError('NOT_A_REASON', 'app_role')
	// explicit undefined is fine on a subject field: same as leaving it out
	void new RoleAssertionError('CHECK_FAILED', 'app_role', { code: undefined })
	return answer
}

describe('assertRole: the types', () => {
	it('are checked by the compiler (yarn typecheck:tests)', () => {
		expect(typeof optionsAreChecked).to.equal('function')
		expect(typeof poolIsChecked).to.equal('function')
		expect(typeof answerIsTyped).to.equal('function')
	})

	it('accept the real pool of the driver', async () => {
		const pool = new pg.Pool()
		const asRolePool: IRolePool = pool
		expect(asRolePool).to.equal(pool)
		await pool.end()
	})
})
