import { assertRole } from '@lib/PostgreSQL/role/assertRole.mjs'
import type { IAssertRoleOptions } from '@lib/PostgreSQL/role/IAssertRoleOptions.mjs'
import type { IRoleGrant } from '@lib/PostgreSQL/role/IRoleGrant.mjs'
import { expect } from 'chai'

import { FakeRoleWorld } from '../../../helpers/fakeRoleWorld.mjs'
import { leakText } from '../../../helpers/fakeTxPool.mjs'
import { failure, healthy, plantedUrl, ROLE } from '../../../helpers/roleFixtures.mjs'

// options the caller got wrong → INVALID_EXPECTATION, found BEFORE pool asked for connection. Pool still closed.
// Input typed unknown on purpose: plain-JS caller can pass anything

const bad: [string, unknown][] = [
	['no options', undefined],
	['null options', null],
	['options that are a string', 'app_role'],
	['a role that is not a string', { expectedRole: 7, expectedGrants: [] }],
	['a role that is a url', { expectedRole: plantedUrl('pw'), expectedGrants: [] }],
	['no role', { expectedGrants: [] }],
	['an empty role', { expectedRole: '', expectedGrants: [] }],
	['a role of 64 characters', { expectedRole: 'a'.repeat(64), expectedGrants: [] }],
	['no grants list', { expectedRole: ROLE }],
	['grants that are not a list', { expectedRole: ROLE, expectedGrants: 'app' }],
	['memberships that are not a list', { expectedRole: ROLE, expectedGrants: [], allowedMemberships: 'owner_role' }],
	['null memberships', { expectedRole: ROLE, expectedGrants: [], allowedMemberships: null }],
	['a membership that is not a name', { expectedRole: ROLE, expectedGrants: [], allowedMemberships: ['owner role'] }],
	['a membership that is not a string', { expectedRole: ROLE, expectedGrants: [], allowedMemberships: [5] }],
	['a grant that is null', { expectedRole: ROLE, expectedGrants: [null] }],
	['a grant that is a string', { expectedRole: ROLE, expectedGrants: ['app'] }],
	['a grant without an object', { expectedRole: ROLE, expectedGrants: [{ privilege: 'SELECT' }] }],
	['an object that is not a string', { expectedRole: ROLE, expectedGrants: [{ object: 5, privilege: 'SELECT' }] }],
	['an object with three parts', { expectedRole: ROLE, expectedGrants: [{ object: 'a.b.c', privilege: 'SELECT' }] }],
	['an object with a quote', { expectedRole: ROLE, expectedGrants: [{ object: 'app."orders"', privilege: 'SELECT' }] }],
	['a privilege that is not a string', { expectedRole: ROLE, expectedGrants: [{ object: 'app.t', privilege: 1 }] }],
	['no privilege', { expectedRole: ROLE, expectedGrants: [{ object: 'app.t' }] }],
	['SELECT on a schema', { expectedRole: ROLE, expectedGrants: [{ object: 'app', privilege: 'SELECT' }] }],
	['columns on a schema', { expectedRole: ROLE, expectedGrants: [{ object: 'app', privilege: 'USAGE', columns: ['a'] }] }],
	['EXECUTE on a bare name', { expectedRole: ROLE, expectedGrants: [{ object: 'f', privilege: 'EXECUTE' }] }],
	['columns on a function', { expectedRole: ROLE, expectedGrants: [{ object: 'app.f', privilege: 'EXECUTE', columns: ['a'] }] }],
	['CREATE on a table', { expectedRole: ROLE, expectedGrants: [{ object: 'app.t', privilege: 'CREATE' }] }],
	['a lower-case privilege', { expectedRole: ROLE, expectedGrants: [{ object: 'app.t', privilege: 'select' }] }],
	['columns with DELETE', { expectedRole: ROLE, expectedGrants: [{ object: 'app.t', privilege: 'DELETE', columns: ['a'] }] }],
	['columns with USAGE', { expectedRole: ROLE, expectedGrants: [{ object: 'app.t', privilege: 'USAGE', columns: ['a'] }] }],
	['an empty column list', { expectedRole: ROLE, expectedGrants: [{ object: 'app.t', privilege: 'SELECT', columns: [] }] }],
	[
		'a column list that is not a list',
		{ expectedRole: ROLE, expectedGrants: [{ object: 'app.t', privilege: 'SELECT', columns: 'a' }] }
	],
	['a null column list', { expectedRole: ROLE, expectedGrants: [{ object: 'app.t', privilege: 'SELECT', columns: null }] }],
	[
		'a column that is not a name',
		{ expectedRole: ROLE, expectedGrants: [{ object: 'app.t', privilege: 'SELECT', columns: ['a b'] }] }
	],
	[
		'a column that is not a string',
		{ expectedRole: ROLE, expectedGrants: [{ object: 'app.t', privilege: 'SELECT', columns: [3] }] }
	],
	[
		'a good grant followed by a bad one',
		{
			expectedRole: ROLE,
			expectedGrants: [
				{ object: 'app', privilege: 'USAGE' },
				{ object: 'app.t', privilege: 'NOPE' }
			]
		}
	]
]

describe('assertRole: options that are not valid', () => {
	for (const [name, given] of bad) {
		it(`${name} fails with INVALID_EXPECTATION, asks the pool for nothing and closes it`, async () => {
			const world = new FakeRoleWorld(healthy())
			// cast: spec feeds input the type forbids, like a plain-JS caller
			const error = await failure(assertRole(world.rolePool, given as IAssertRoleOptions))
			expect(error.reason).to.equal('INVALID_EXPECTATION')
			expect(world.clients).to.have.length(0)
			expect(world.calls).to.have.length(0)
			expect(world.ended).to.equal(1)
		})
	}

	it('prints a role name that is not a plain name as ?, so a connection string given by mistake is not repeated', async () => {
		const world = new FakeRoleWorld(healthy())
		const error = await failure(assertRole(world.rolePool, { expectedRole: plantedUrl('planted-secret'), expectedGrants: [] }))
		expect(error.role).to.equal('?')
		expect(error.message).to.equal('role assertion failed for ?: INVALID_EXPECTATION')
		expect(leakText(error, [])).to.not.contain('planted-secret')
	})

	it('prints ? for a role that is not even a string, and never the word undefined', async () => {
		const world = new FakeRoleWorld(healthy())
		// cast: no options at all, like a plain-JS caller
		const error = await failure(assertRole(world.rolePool, undefined as never))
		expect(error.role).to.equal('?')
		expect(error.message).to.equal('role assertion failed for ?: INVALID_EXPECTATION')
	})

	it('names the role when the role is fine and a grant is not', async () => {
		const world = new FakeRoleWorld(healthy())
		const error = await failure(
			assertRole(world.rolePool, { expectedRole: ROLE, expectedGrants: [{ object: 'a.b.c', privilege: 'SELECT' }] })
		)
		expect(error.role).to.equal(ROLE)
		expect(error.message).to.equal('role assertion failed for app_role: INVALID_EXPECTATION')
	})
})

describe('assertRole: options that are valid', () => {
	it('accepts a qualified name with $ and digits and a grant on a column with a digit', async () => {
		const world = new FakeRoleWorld(healthy({ current: 'r$1' }))
		const result = await assertRole(world.rolePool, {
			expectedRole: 'r$1',
			expectedGrants: [{ object: 's_1.t$2', privilege: 'REFERENCES', columns: ['c_1'] }]
		})
		expect(result).to.deep.equal({ role: 'r$1', grantsChecked: 1 })
	})

	it('accepts a name of 63 characters and refuses one of 64, for the role, a schema, a table and a column', async () => {
		const long = 'a'.repeat(63)
		const world = new FakeRoleWorld(healthy({ current: long }))
		const result = await assertRole(world.rolePool, {
			expectedRole: long,
			expectedGrants: [
				{ object: long, privilege: 'USAGE' },
				{ object: `${long}.${long}`, privilege: 'SELECT', columns: [long] }
			],
			allowedMemberships: [long]
		})
		expect(result.grantsChecked).to.equal(2)
	})

	it('accepts every privilege of each kind of object, and each one is checked', async () => {
		const schemaPrivileges = ['USAGE', 'CREATE']
		const relationPrivileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'USAGE']
		const columnPrivileges = ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']
		const expectedGrants: IRoleGrant[] = [
			...schemaPrivileges.map((privilege): IRoleGrant => ({ object: 'app', privilege })),
			...relationPrivileges.map((privilege): IRoleGrant => ({ object: 'app.t', privilege })),
			...columnPrivileges.map((privilege): IRoleGrant => ({ object: 'app.t', privilege, columns: ['c'] })),
			{ object: 'app.f', privilege: 'EXECUTE' }
		]
		const world = new FakeRoleWorld(healthy())
		const result = await assertRole(world.rolePool, { expectedRole: ROLE, expectedGrants })
		expect(result.grantsChecked).to.equal(15)
		// 2nd value of each grant call: the privilege, or the function name for the function call
		expect(world.calls.slice(3).map((call) => call.values?.[1])).to.deep.equal([
			...schemaPrivileges,
			...relationPrivileges,
			...columnPrivileges,
			'f'
		])
	})
})
