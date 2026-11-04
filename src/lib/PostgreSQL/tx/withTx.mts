import type { ITx } from '@lib/PostgreSQL/tx/ITx.mjs'
import type { ITxOptions } from '@lib/PostgreSQL/tx/ITxOptions.mjs'
import type { ITxPool } from '@lib/PostgreSQL/tx/ITxPool.mjs'
import { runTxWithRetries } from '@private/lib/PostgreSQL/runTxWithRetries.mjs'
import { txSettings } from '@private/lib/PostgreSQL/txSettings.mjs'

/**
 * Runs `fn` in a transaction and answers what it answers. It is the one transaction wrapper, so that no caller writes
 * its own isolation, lock timeout or retry loop.
 *
 * What one attempt does, in order:
 *
 * 1. Checks a connection out of the pool and listens to its `error` event while it holds it.
 * 2. `BEGIN ISOLATION LEVEL <level> [READ ONLY]`, the text taken from a closed table (never built), then
 *    `SET LOCAL lock_timeout = <ms>`. `SET LOCAL` is the only form of `SET` here: the value ends with the transaction,
 *    so the role-level value is back for the next user of the connection, and a transaction pooler stays usable.
 * 3. Runs `fn` with a handle that has one member, `query`. The pool and the connection are not reachable from the
 *    handle, and the handle stops working when the transaction ends, so a statement cannot run outside the
 *    transaction, not even through a handle that `fn` kept.
 * 4. `COMMIT` when `fn` resolved; `ROLLBACK` when anything threw. A rollback that fails does not hide the error that
 *    caused it: the original error is thrown, and the connection is destroyed instead of returned to the pool.
 *
 * What the loop does with a failure of an attempt, by SQLSTATE:
 *
 * - `40001` (serialisation failure) and `40P01` (deadlock detected): the whole attempt was rolled back; `fn` runs again
 *   in a fresh transaction on a fresh checkout, after the injected delay, up to `retryMax` times (default
 *   `TX_RETRY_MAX`). After the last one fails too the caller gets `options.errors.internal('TX_RETRY_EXHAUSTED')`.
 * - `55P03` (lock not available, the lock timeout): no retry; `options.errors.internal('LOCK_TIMEOUT')`.
 * - anything else: rethrown unchanged (the same object) after the rollback.
 *
 * The two errors of the factory are asked for a reason and nothing else: no `cause`, no driver message, no constraint
 * name. The reason goes to the log and to a counter, with the SQLSTATE and the number of attempts and nothing the
 * driver wrote.
 *
 * A swallowed failure is not a success: if `fn` catches the error of a statement and resolves, the server answers
 * `COMMIT` with the tag `ROLLBACK` (the transaction is aborted). The wrapper reads the tag and throws the first failed
 * statement, which then goes through the classification above.
 *
 * Rejects with `TypeError` for an option out of range (before a connection is taken). `fn` may run more than once, so it
 * must hold no state that a failed run leaves behind.
 */
export async function withTx<T>(pool: ITxPool, options: ITxOptions, fn: (tx: ITx) => Promise<T>): Promise<T> {
	return runTxWithRetries(pool, txSettings(options), fn, 0)
}
