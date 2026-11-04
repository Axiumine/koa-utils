import { DbConnectError } from '@lib/PostgreSQL/error/DbConnectError.mjs'
import { ROLE_ASSERT_REASONS } from '@lib/PostgreSQL/error/ROLE_ASSERT_REASONS.mjs'
import { assertRole } from '@lib/PostgreSQL/role/assertRole.mjs'
import { expect } from 'chai'

import { FakeRoleWorld, heldKey, type IFakeCatalog, statementKind } from '../../../helpers/fakeRoleWorld.mjs'
import { driverError, leakText } from '../../../helpers/fakeTxPool.mjs'
import { failure, healthy, held, options, ROLE } from '../../../helpers/roleFixtures.mjs'

// check cannot be made / answer malformed → CHECK_FAILED, never a pass. Pool always closed on failure, client
// destroyed (not returned) when it broke. Nothing of connection string or driver text in the error

const IDENTITY_ROW = {
	effective_role: ROLE,
	login_role: ROLE,
	superuser: false,
	createrole: false,
	createdb: false,
	bypassrls: false,
	replication: false
}

describe('assertRole: the check cannot be made', () => {
	it('a refused connection is CHECK_FAILED with the closed reason of the connect error as the code', async () => {
		const world = new FakeRoleWorld(healthy())
		world.connectError = new DbConnectError('CONNECT_TIMEOUT')
		const error = await failure(assertRole(world.rolePool, options()))
		expect(error.reason).to.equal('CHECK_FAILED')
		expect(error.code).to.equal('CONNECT_TIMEOUT')
		expect(error.message).to.equal('role assertion failed for app_role: CHECK_FAILED (CONNECT_TIMEOUT)')
		expect(world.ended).to.equal(1)
		expect(world.clients).to.have.length(0)
	})

	it('the closed reason of a connect error wins over a code the error also carries', async () => {
		const world = new FakeRoleWorld(healthy())
		world.connectError = new DbConnectError('CONNECT_FAILED', 'ECONNREFUSED')
		expect((await failure(assertRole(world.rolePool, options()))).code).to.equal('CONNECT_FAILED')
	})

	it('a catalog statement that fails is CHECK_FAILED with its SQLSTATE, and the client is destroyed, not returned', async () => {
		const world = new FakeRoleWorld(healthy())
		world.respond = (call) => {
			if (statementKind(call) === 'owns')
				throw driverError('42501', 'permission denied for table pg_shdepend: planted-driver-text')
			return { rows: [IDENTITY_ROW] }
		}
		const error = await failure(assertRole(world.rolePool, options()))
		expect(error.reason).to.equal('CHECK_FAILED')
		expect(error.code).to.equal('42501')
		expect(world.clients[0]?.released).to.deep.equal([true])
		expect(world.clients[0]?.listenerCount('error')).to.equal(0)
		expect(world.ended).to.equal(1)
		expect(leakText(error, [])).to.not.contain('planted-driver-text')
	})

	it('a failure that carries no code, an unsafe code or no object is CHECK_FAILED without a code', async () => {
		const thrown: unknown[] = [
			'a string',
			null,
			new Error('no code'),
			Object.assign(new Error('x'), { code: 'not a safe code, a sentence with spaces' }),
			Object.assign(new Error('x'), { code: 12 }),
			Object.assign(new Error('x'), { code: 'A'.repeat(33) })
		]
		for (const failureValue of thrown) {
			const world = new FakeRoleWorld(healthy())
			world.connectError = failureValue
			const error = await failure(assertRole(world.rolePool, options()))
			expect(error.reason).to.equal('CHECK_FAILED')
			expect(error.code).to.equal(undefined)
			expect(error.message).to.equal('role assertion failed for app_role: CHECK_FAILED')
		}
	})

	it('keeps a short driver code such as ECONNREFUSED', async () => {
		const world = new FakeRoleWorld(healthy())
		world.connectError = driverError('ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:5432')
		expect((await failure(assertRole(world.rolePool, options()))).code).to.equal('ECONNREFUSED')
	})
})

describe('assertRole: an answer that is not what the catalog gives', () => {
	const broken: [string, (kind: string) => unknown][] = [
		['rows that are not a list', () => ({ rows: 'x' })],
		['no rows field', () => ({})],
		['no identity row', (kind) => (kind === 'identity' ? { rows: [] } : { rows: [{}] })],
		['two identity rows', (kind) => (kind === 'identity' ? { rows: [IDENTITY_ROW, IDENTITY_ROW] } : { rows: [{}] })],
		['an identity row that is null', (kind) => (kind === 'identity' ? { rows: [null] } : { rows: [{}] })],
		['an identity row that is a string', (kind) => (kind === 'identity' ? { rows: ['x'] } : { rows: [{}] })],
		[
			'a role name that is not text',
			(kind) => (kind === 'identity' ? { rows: [{ ...IDENTITY_ROW, effective_role: 5 }] } : { rows: [{}] })
		],
		[
			'a flag that is not a boolean',
			(kind) => (kind === 'identity' ? { rows: [{ ...IDENTITY_ROW, superuser: 'f' }] } : { rows: [{}] })
		],
		[
			'a last flag that is missing',
			(kind) => (kind === 'identity' ? { rows: [{ ...IDENTITY_ROW, replication: undefined }] } : { rows: [{}] })
		],
		[
			'an ownership flag that is not a boolean',
			(kind) => (kind === 'identity' ? { rows: [IDENTITY_ROW] } : { rows: [{ owns: 0 }] })
		],
		[
			'two ownership rows',
			(kind) => (kind === 'identity' ? { rows: [IDENTITY_ROW] } : { rows: [{ owns: false }, { owns: false }] })
		],
		[
			'a membership name that is not text',
			(kind) => {
				if (kind === 'identity') return { rows: [IDENTITY_ROW] }
				if (kind === 'owns') return { rows: [{ owns: false }] }
				return { rows: [{ member_of: 3 }] }
			}
		],
		[
			'a login role that is not text',
			(kind) => {
				if (kind === 'identity') return { rows: [{ ...IDENTITY_ROW, login_role: null }] }
				if (kind === 'owns') return { rows: [{ owns: false }] }
				return { rows: [] }
			}
		],
		[
			'a column name that is not text',
			(kind) => {
				if (kind === 'identity') return { rows: [IDENTITY_ROW] }
				if (kind === 'owns') return { rows: [{ owns: false }] }
				if (kind === 'memberships') return { rows: [] }
				return kind === 'columns' ? { rows: [{ name: 9, held: true }] } : { rows: [{ held: true }] }
			}
		]
	]

	for (const [name, answer] of broken) {
		it(`${name} is CHECK_FAILED, the client is destroyed and the pool closed`, async () => {
			const world = new FakeRoleWorld(healthy())
			world.respond = (call) => answer(statementKind(call)) as never
			const error = await failure(assertRole(world.rolePool, options()))
			expect(error.reason).to.equal('CHECK_FAILED')
			expect(error.code).to.equal(undefined)
			expect(world.ended).to.equal(1)
			expect(world.clients[0]?.released).to.deep.equal([true])
		})
	}

	it('an error event of the client during the check destroys it, and the listener is removed', async () => {
		const world = new FakeRoleWorld(healthy())
		const respond = world.respond
		world.respond = (call, nth) => {
			if (nth === 0) world.clients[0]?.emit('error', new Error('connection lost'))
			return respond(call, nth)
		}
		await assertRole(world.rolePool, options())
		expect(world.clients[0]?.released).to.deep.equal([true])
		expect(world.clients[0]?.listenerCount('error')).to.equal(0)
	})

	it('a client that emitted an error is destroyed even when the check then fails an assertion', async () => {
		const world = new FakeRoleWorld(healthy({ current: 'migrator_role' }))
		const respond = world.respond
		world.respond = (call, nth) => {
			world.clients[0]?.emit('error', new Error('connection lost'))
			return respond(call, nth)
		}
		const error = await failure(assertRole(world.rolePool, options()))
		expect(error.reason).to.equal('ROLE_MISMATCH')
		expect(world.clients[0]?.released).to.deep.equal([true])
	})

	it('a client that only failed an assertion goes back to the pool', async () => {
		const world = new FakeRoleWorld(healthy({ held: held([heldKey('schema', 'app', 'USAGE'), false]) }))
		await failure(assertRole(world.rolePool, options()))
		expect(world.clients[0]?.released).to.deep.equal([false])
		expect(world.clients[0]?.listenerCount('error')).to.equal(0)
	})
})

describe('assertRole: the pool is closed and nothing leaks', () => {
	it('throws the failure of the assertion even when closing the pool fails', async () => {
		const world = new FakeRoleWorld(healthy({ current: 'migrator_role' }))
		world.endError = new Error('Called end on pool more than once')
		const error = await failure(assertRole(world.rolePool, options()))
		expect(error.reason).to.equal('ROLE_MISMATCH')
		expect(world.ended).to.equal(1)
	})

	it('throws CHECK_FAILED even when closing the pool fails, and also when it fails with a non-Error', async () => {
		for (const endError of [new Error('x'), 'a string', 0]) {
			const world = new FakeRoleWorld(healthy())
			world.connectError = driverError('ECONNRESET', 'reset')
			world.endError = endError
			const error = await failure(assertRole(world.rolePool, options()))
			expect([error.reason, error.code]).to.deep.equal(['CHECK_FAILED', 'ECONNRESET'])
			expect(world.ended).to.equal(1)
		}
	})

	it('closes the pool once for each kind of failure and not at all for a pass', async () => {
		const failing: Partial<IFakeCatalog>[] = [
			{ current: 'x' },
			{ flags: { createdb: true } },
			{ owns: true },
			{ memberOf: ['r'] },
			{ login: 'x' },
			{ held: held([heldKey('schema', 'app', 'USAGE'), false]) }
		]
		for (const extra of failing) {
			const world = new FakeRoleWorld(healthy(extra))
			await failure(assertRole(world.rolePool, options()))
			expect(world.ended).to.equal(1)
		}
		const passing = new FakeRoleWorld(healthy())
		await assertRole(passing.rolePool, options())
		expect(passing.ended).to.equal(0)
	})

	it('never repeats the connection string of the pool, or a driver text, in the error, its serialisations or its fields', async () => {
		const world = new FakeRoleWorld(healthy({ current: 'migrator_role' }))
		const error = await failure(assertRole(world.rolePool, options()))
		const text = leakText(error, [])
		expect(text).to.not.contain('planted-pool-secret')
		expect(text).to.not.contain('db.example.test')
		expect(text).to.contain(ROLE)
		expect(text).to.contain('ROLE_MISMATCH')
		expect(error.cause).to.equal(undefined)
	})

	it('every reason in the closed list has a test above or in the other assertRole specs that reaches it', async () => {
		const reached = new Set<string>()
		const catalogs: [Partial<IFakeCatalog>, string][] = [
			[{ current: 'x' }, 'ROLE_MISMATCH'],
			[{ flags: { superuser: true } }, 'ROLE_SUPERUSER'],
			[{ flags: { createrole: true } }, 'ROLE_CREATEROLE'],
			[{ flags: { createdb: true } }, 'ROLE_CREATEDB'],
			[{ flags: { bypassrls: true } }, 'ROLE_BYPASSRLS'],
			[{ flags: { replication: true } }, 'ROLE_REPLICATION'],
			[{ owns: true }, 'ROLE_OWNS_OBJECTS'],
			[{ memberOf: ['r'] }, 'ROLE_MEMBERSHIP'],
			[{ login: 'x' }, 'SESSION_ROLE_DIFFERS'],
			[{ held: held([heldKey('schema', 'app', 'USAGE'), false]) }, 'GRANT_MISSING']
		]
		for (const [extra] of catalogs) {
			const world = new FakeRoleWorld(healthy(extra))
			reached.add((await failure(assertRole(world.rolePool, options()))).reason)
		}
		const invalid = new FakeRoleWorld(healthy())
		reached.add((await failure(assertRole(invalid.rolePool, { expectedRole: '', expectedGrants: [] }))).reason)
		const refused = new FakeRoleWorld(healthy())
		refused.connectError = new Error('refused')
		reached.add((await failure(assertRole(refused.rolePool, options()))).reason)
		expect([...reached].sort()).to.deep.equal([...ROLE_ASSERT_REASONS].sort())
	})
})
