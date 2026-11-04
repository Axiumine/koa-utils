import type { IRoleAssertionReason } from '@lib/PostgreSQL/error/IRoleAssertionReason.mjs'
import { assertRole } from '@lib/PostgreSQL/role/assertRole.mjs'
import { expect } from 'chai'

import { FakeRoleWorld, heldKey } from '../../../helpers/fakeRoleWorld.mjs'
import { failure, GRANTS, healthy, held, options, ROLE } from '../../../helpers/roleFixtures.mjs'

// assertRole vs fake pool + model of catalog. Order of checks, what each failure names, what pool does.
// Statement TEXT pinned in assertRole.sql.spec.mts. Options validation → assertRole.options.spec.mts. Unreachable
// catalog / malformed answers → assertRole.failures.spec.mts

describe('assertRole: a role that passes', () => {
	it('answers the role and the number of grants, leaves the pool open and gives the client back', async () => {
		const world = new FakeRoleWorld(healthy())
		const result = await assertRole(world.rolePool, options())
		expect(result).to.deep.equal({ role: ROLE, grantsChecked: 5 })
		expect(world.ended).to.equal(0)
		expect(world.clients).to.have.length(1)
		expect(world.clients[0]?.released).to.deep.equal([false])
		expect(world.clients[0]?.listenerCount('error')).to.equal(0)
	})

	it('asks the identity, the ownership, the memberships and then each grant, in the order of the list', async () => {
		const world = new FakeRoleWorld(healthy())
		await assertRole(world.rolePool, options())
		expect(world.kinds).to.deep.equal([
			'identity',
			'owns',
			'memberships',
			'schema',
			'relation',
			'columns',
			'function',
			'relation'
		])
	})

	it('passes the object and the privilege as parameters, never in the text', async () => {
		const world = new FakeRoleWorld(healthy())
		await assertRole(world.rolePool, options())
		expect(world.calls.slice(3).map((call) => call.values)).to.deep.equal([
			['app', 'USAGE'],
			['app.orders', 'SELECT'],
			['app.items', 'UPDATE', ['label', 'locale']],
			['app', 'resolve_token'],
			['app.order_seq', 'USAGE']
		])
		for (const call of world.calls) {
			expect(call.text).to.not.contain('app.orders')
			expect(call.text).to.not.contain(ROLE)
		}
	})

	it('sends the three role statements with one argument and each grant statement with two', async () => {
		const world = new FakeRoleWorld(healthy())
		await assertRole(world.rolePool, options())
		expect(world.calls.map((call) => call.argc)).to.deep.equal([1, 1, 1, 2, 2, 2, 2, 2])
	})

	it('passes with no grants (the attributes, ownership and memberships are still checked)', async () => {
		const world = new FakeRoleWorld(healthy())
		expect(await assertRole(world.rolePool, { expectedRole: ROLE, expectedGrants: [] })).to.deep.equal({
			role: ROLE,
			grantsChecked: 0
		})
		expect(world.kinds).to.deep.equal(['identity', 'owns', 'memberships'])
	})

	it('accepts a membership the call allows, directly or through a chain', async () => {
		const world = new FakeRoleWorld(healthy({ memberOf: ['reader_role', 'owner_role'] }))
		const result = await assertRole(world.rolePool, options({ allowedMemberships: ['owner_role', 'reader_role'] }))
		expect(result.role).to.equal(ROLE)
	})
})

describe('assertRole: the role is not the expected one', () => {
	it('fails with ROLE_MISMATCH before any other check, naming the role and the reason', async () => {
		const world = new FakeRoleWorld(healthy({ current: 'migrator_role', flags: { superuser: true } }))
		const error = await failure(assertRole(world.rolePool, options()))
		expect(error.reason).to.equal('ROLE_MISMATCH')
		expect(error.role).to.equal(ROLE)
		expect(error.message).to.equal('role assertion failed for app_role: ROLE_MISMATCH')
		expect(world.kinds).to.deep.equal(['identity'])
	})

	it('closes the pool and gives the client back before it throws', async () => {
		const world = new FakeRoleWorld(healthy({ current: 'migrator_role' }))
		await failure(assertRole(world.rolePool, options()))
		expect(world.ended).to.equal(1)
		expect(world.clients[0]?.released).to.deep.equal([false])
	})

	it('fails when the login is another role than the one switched to', async () => {
		const world = new FakeRoleWorld(healthy({ login: 'migrator_role' }))
		const error = await failure(assertRole(world.rolePool, options()))
		expect(error.reason).to.equal('SESSION_ROLE_DIFFERS')
		expect(error.message).to.equal('role assertion failed for app_role: SESSION_ROLE_DIFFERS')
		expect(world.kinds).to.deep.equal(['identity', 'owns', 'memberships'])
		expect(world.ended).to.equal(1)
	})
})

describe('assertRole: the attributes of the role', () => {
	const cases: [string, IRoleAssertionReason][] = [
		['superuser', 'ROLE_SUPERUSER'],
		['createrole', 'ROLE_CREATEROLE'],
		['createdb', 'ROLE_CREATEDB'],
		['bypassrls', 'ROLE_BYPASSRLS'],
		['replication', 'ROLE_REPLICATION']
	]

	for (const [flag, reason] of cases) {
		it(`${flag} fails with ${reason}`, async () => {
			const world = new FakeRoleWorld(healthy({ flags: { [flag]: true } }))
			const error = await failure(assertRole(world.rolePool, options()))
			expect(error.reason).to.equal(reason)
			expect(error.message).to.equal(`role assertion failed for app_role: ${reason}`)
			expect(world.kinds).to.deep.equal(['identity'])
			expect(world.ended).to.equal(1)
		})
	}

	it('reports the first attribute of the order when the role has several', async () => {
		const world = new FakeRoleWorld(healthy({ flags: { replication: true, bypassrls: true, createdb: true } }))
		expect((await failure(assertRole(world.rolePool, options()))).reason).to.equal('ROLE_CREATEDB')
		const all = new FakeRoleWorld(
			healthy({ flags: { superuser: true, createrole: true, createdb: true, bypassrls: true, replication: true } })
		)
		expect((await failure(assertRole(all.rolePool, options()))).reason).to.equal('ROLE_SUPERUSER')
	})

	it('checks the role name before the attributes', async () => {
		const world = new FakeRoleWorld(healthy({ current: 'migrator_role', flags: { createdb: true } }))
		expect((await failure(assertRole(world.rolePool, options()))).reason).to.equal('ROLE_MISMATCH')
	})
})

describe('assertRole: ownership and membership', () => {
	it('fails with ROLE_OWNS_OBJECTS when the catalog lists an owned object', async () => {
		const world = new FakeRoleWorld(healthy({ owns: true }))
		const error = await failure(assertRole(world.rolePool, options()))
		expect(error.reason).to.equal('ROLE_OWNS_OBJECTS')
		expect(world.kinds).to.deep.equal(['identity', 'owns'])
		expect(world.ended).to.equal(1)
	})

	it('fails with ROLE_MEMBERSHIP naming the first role that the call did not allow', async () => {
		const world = new FakeRoleWorld(healthy({ memberOf: ['reader_role', 'owner_role', 'pg_signal_backend'] }))
		const error = await failure(assertRole(world.rolePool, options({ allowedMemberships: ['reader_role'] })))
		expect(error.reason).to.equal('ROLE_MEMBERSHIP')
		expect(error.object).to.equal('owner_role')
		expect(error.message).to.equal('role assertion failed for app_role: ROLE_MEMBERSHIP (member of owner_role)')
		expect(world.kinds).to.deep.equal(['identity', 'owns', 'memberships'])
	})

	it('names the first role in name order, whatever order the catalog answers in', async () => {
		const world = new FakeRoleWorld(healthy({ memberOf: ['pg_signal_backend', 'owner_role', 'admin_role'] }))
		expect((await failure(assertRole(world.rolePool, options()))).object).to.equal('admin_role')
	})

	it('allows no membership by default', async () => {
		const world = new FakeRoleWorld(healthy({ memberOf: ['owner_role'] }))
		expect((await failure(assertRole(world.rolePool, options()))).reason).to.equal('ROLE_MEMBERSHIP')
	})

	it('checks ownership before membership and membership before the session', async () => {
		const world = new FakeRoleWorld(healthy({ owns: true, memberOf: ['owner_role'], login: 'x' }))
		expect((await failure(assertRole(world.rolePool, options()))).reason).to.equal('ROLE_OWNS_OBJECTS')
		const second = new FakeRoleWorld(healthy({ memberOf: ['owner_role'], login: 'x' }))
		expect((await failure(assertRole(second.rolePool, options()))).reason).to.equal('ROLE_MEMBERSHIP')
	})
})

describe('assertRole: the grants', () => {
	it('names the first missing object and privilege and asks nothing after it', async () => {
		const world = new FakeRoleWorld(healthy({ held: held([heldKey('relation', 'app.orders', 'SELECT'), false]) }))
		const error = await failure(assertRole(world.rolePool, options()))
		expect(error.reason).to.equal('GRANT_MISSING')
		expect(error.object).to.equal('app.orders')
		expect(error.privilege).to.equal('SELECT')
		expect(error.column).to.equal(undefined)
		expect(error.message).to.equal('role assertion failed for app_role: GRANT_MISSING (SELECT on app.orders)')
		expect(world.kinds).to.deep.equal(['identity', 'owns', 'memberships', 'schema', 'relation'])
		expect(world.ended).to.equal(1)
	})

	it('reports the first missing of several, in the order of the list', async () => {
		const world = new FakeRoleWorld(
			healthy({
				held: held([heldKey('function', 'app.resolve_token', 'EXECUTE'), false], [heldKey('schema', 'app', 'USAGE'), false])
			})
		)
		const error = await failure(assertRole(world.rolePool, options()))
		expect([error.object, error.privilege]).to.deep.equal(['app', 'USAGE'])
	})

	it('a schema, a function and a sequence are named like a table', async () => {
		const cases = [
			[0, 'schema', 'app', 'USAGE'],
			[3, 'function', 'app.resolve_token', 'EXECUTE'],
			[4, 'relation', 'app.order_seq', 'USAGE']
		] as const
		for (const [index, kind, object, privilege] of cases) {
			const world = new FakeRoleWorld(healthy({ held: held([heldKey(kind, object, privilege), false]) }))
			const error = await failure(assertRole(world.rolePool, options()))
			expect(GRANTS[index]).to.deep.include({ object, privilege })
			expect([error.object, error.privilege]).to.deep.equal([object, privilege])
			expect(error.message).to.contain(`${privilege} on ${object}`)
		}
	})

	it('an object that does not exist counts as missing: a null, no row, two rows, a non-boolean, a null row', async () => {
		for (const answer of [null, 'no-row', 'two-rows', 'not-a-boolean', 'null-row'] as const) {
			const world = new FakeRoleWorld(healthy({ held: held([heldKey('relation', 'app.orders', 'SELECT'), answer]) }))
			const error = await failure(assertRole(world.rolePool, options()))
			expect([answer, error.reason, error.object]).to.deep.equal([answer, 'GRANT_MISSING', 'app.orders'])
		}
	})

	it('names the first missing column of a column-level grant', async () => {
		const world = new FakeRoleWorld(
			healthy({
				columnsHeld: () => [
					{ name: 'label', held: true },
					{ name: 'locale', held: false }
				]
			})
		)
		const error = await failure(assertRole(world.rolePool, options()))
		expect(error.reason).to.equal('GRANT_MISSING')
		expect([error.object, error.privilege, error.column]).to.deep.equal(['app.items', 'UPDATE', 'locale'])
		expect(error.message).to.equal('role assertion failed for app_role: GRANT_MISSING (UPDATE on app.items column locale)')
	})

	it('a column the table does not have is missing too', async () => {
		const world = new FakeRoleWorld(healthy({ columnsHeld: () => [{ name: 'locale', held: true }] }))
		expect((await failure(assertRole(world.rolePool, options()))).column).to.equal('label')
	})

	it('no row for a column-level check means the first column is missing', async () => {
		const world = new FakeRoleWorld(healthy({ columnsHeld: () => [] }))
		expect((await failure(assertRole(world.rolePool, options()))).column).to.equal('label')
	})

	it('a column row whose held is not the boolean true is missing', async () => {
		const world = new FakeRoleWorld(
			healthy({
				columnsHeld: () => [
					{ name: 'label', held: 't' as never },
					{ name: 'locale', held: true }
				]
			})
		)
		// cast above: spec feeds a non-boolean answer on purpose → must count as missing, never as held
		expect((await failure(assertRole(world.rolePool, options()))).column).to.equal('label')
	})
})
