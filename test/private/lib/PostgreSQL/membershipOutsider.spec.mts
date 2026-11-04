import { membershipOutsider } from '@private/lib/PostgreSQL/membershipOutsider.mjs'
import { ROLE_CATALOG_SQL } from '@private/lib/PostgreSQL/ROLE_CATALOG_SQL.mjs'
import { expect } from 'chai'

import { FakeTxWorld } from '../../../helpers/fakeTxPool.mjs'

async function outsiderOf(memberOf: string[], allowed: string[]): Promise<string | undefined> {
	const world = new FakeTxWorld(() => ({ rows: memberOf.map((name) => ({ member_of: name })) }))
	const client = await world.pool.connect()
	return membershipOutsider(client, new Set(allowed))
}

describe('membershipOutsider', () => {
	it('sends the membership statement alone', async () => {
		const world = new FakeTxWorld()
		const client = await world.pool.connect()
		await membershipOutsider(client, new Set())
		expect(world.calls.map((call) => [call.text, call.argc])).to.deep.equal([[ROLE_CATALOG_SQL.memberships, 1]])
	})

	it('is undefined when the role is a member of nothing, or only of allowed roles', async () => {
		expect(await outsiderOf([], [])).to.equal(undefined)
		expect(await outsiderOf(['a', 'b'], ['b', 'a', 'c'])).to.equal(undefined)
	})

	it('is the first outsider in code unit order, whatever order the catalog answers in', async () => {
		expect(await outsiderOf(['pg_signal_backend', 'owner_role', 'admin_role'], [])).to.equal('admin_role')
		expect(await outsiderOf(['b', 'a', 'c'], ['a'])).to.equal('b')
	})

	it('sorts upper case before lower case and digits before letters: code units, not a locale', async () => {
		expect(await outsiderOf(['a', 'B'], [])).to.equal('B')
		expect(await outsiderOf(['a', '1'], [])).to.equal('1')
		expect(await outsiderOf(['_a', 'Z', 'a'], [])).to.equal('Z')
	})

	it('skips an allowed role even when it sorts first', async () => {
		expect(await outsiderOf(['a_role', 'b_role'], ['a_role'])).to.equal('b_role')
	})

	it('throws a TypeError for a membership name that is not text', async () => {
		let thrown: unknown
		try {
			await outsiderOf([3 as never], [])
		} catch (error) {
			thrown = error
		}
		expect(thrown).to.be.instanceOf(TypeError)
	})
})
