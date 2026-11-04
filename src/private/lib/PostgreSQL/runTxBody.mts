import { DbTxError } from '@lib/PostgreSQL/error/DbTxError.mjs'
import type { ITx } from '@lib/PostgreSQL/tx/ITx.mjs'
import type { ITxClient } from '@lib/PostgreSQL/tx/ITxClient.mjs'

import type { ITxHandleState } from './ITxHandleState.mjs'
import type { ITxSettings } from './ITxSettings.mjs'
import { txHandle } from './txHandle.mjs'

/**
 * The body of one attempt, from `BEGIN` to the answer of `COMMIT`: the two opening statements, `fn` with its handle,
 * then the commit. The handle is closed before the commit starts. A `COMMIT` the server answers with the tag `ROLLBACK`
 * (what it does for a transaction that a failed statement aborted) throws the first failed statement of the handle, or
 * `DbTxError` `COMMIT_ROLLED_BACK` when none is known. It sends no `ROLLBACK`; the caller does that for any throw.
 */
export async function runTxBody<T>(
	client: ITxClient,
	settings: ITxSettings,
	fn: (tx: ITx) => Promise<T>,
	state: ITxHandleState
): Promise<T> {
	await client.query(settings.begin)
	await client.query(settings.setLockTimeout)
	const result = await fn(txHandle(client, state))
	state.open = false
	const committed = await client.query('COMMIT')
	if (committed.command === 'ROLLBACK') throw state.failed ? state.failure : new DbTxError('COMMIT_ROLLED_BACK')
	return result
}
