import { RoleAssertionError } from '@lib/PostgreSQL/error/RoleAssertionError.mjs'
import type { IRoleAssertion } from '@lib/PostgreSQL/role/IRoleAssertion.mjs'
import type { IRolePool } from '@lib/PostgreSQL/role/IRolePool.mjs'

import type { IRolePlan } from './IRolePlan.mjs'
import { runRoleChecks } from './runRoleChecks.mjs'

/**
 * Checks out one connection, runs the checks on it and gives it back. A connection that emitted an error, or that
 * failed in the middle of a query, is destroyed instead of returned to the pool; one that only failed an assertion is
 * returned. The listener for the connection's `error` event is removed before the release, so a connection never goes
 * back to the pool with it.
 */
export async function checkRoleOnClient(pool: IRolePool, plan: IRolePlan): Promise<IRoleAssertion> {
	const client = await pool.connect()
	const state = { broken: false }
	const onError = (): void => {
		state.broken = true
	}
	client.on('error', onError)
	let grantsChecked: number
	try {
		grantsChecked = await runRoleChecks(client, plan)
	} catch (error) {
		if (!(error instanceof RoleAssertionError)) state.broken = true
		throw error
	} finally {
		client.removeListener('error', onError)
		client.release(state.broken)
	}
	return { role: plan.role, grantsChecked }
}
