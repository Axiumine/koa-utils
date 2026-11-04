import { DbTxError } from '@lib/PostgreSQL/error/DbTxError.mjs'
import type { ITx } from '@lib/PostgreSQL/tx/ITx.mjs'
import type { ITxClient } from '@lib/PostgreSQL/tx/ITxClient.mjs'
import type { ITxResult } from '@lib/PostgreSQL/tx/ITxResult.mjs'

import type { ITxHandleState } from './ITxHandleState.mjs'

/**
 * The handle one attempt gives to the function: a frozen object with the one member `query`. It refuses a statement
 * once `state.open` is false, and it remembers the first statement that failed, so a failure the function swallows is
 * still known at commit.
 */
export function txHandle(client: ITxClient, state: ITxHandleState): ITx {
	return Object.freeze({
		async query<TRow>(text: string, values?: readonly unknown[]): Promise<ITxResult<TRow>> {
			if (!state.open) throw new DbTxError('HANDLE_CLOSED')
			try {
				const result = values === undefined ? await client.query(text) : await client.query(text, values)
				return result as ITxResult<TRow>
			} catch (error) {
				if (!state.failed) {
					state.failed = true
					state.failure = error
				}
				throw error
			}
		}
	})
}
