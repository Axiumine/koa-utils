import type { ITxResult } from '@lib/PostgreSQL/tx/ITxResult.mjs'

/**
 * The transaction handle that the function given to `withTx` receives: one method. It has no `connect`, `release`,
 * `end` or pool, and a statement sent after the transaction ended is refused with `DbTxError` `HANDLE_CLOSED`. The text
 * is a literal and the values are parameters (`$1`, `$2`).
 */
export interface ITx {
	query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<ITxResult<TRow>>
}
