/**
 * The counters `withTx` increments:
 *
 * - `db_tx_retries_total`: a transaction was rolled back on SQLSTATE 40001 or 40P01 and will run again.
 * - `db_tx_retry_exhausted_total`: the last retry failed too; the caller got the error for `TX_RETRY_EXHAUSTED`.
 * - `db_tx_lock_timeouts_total`: a statement waited longer than the lock timeout (SQLSTATE 55P03).
 * - `db_tx_rollback_failures_total`: the rollback itself failed; the connection was destroyed.
 * - `db_tx_client_errors_total`: the connection of a running transaction emitted an `error` event.
 */
export type ITxCounterName =
	| 'db_tx_retries_total'
	| 'db_tx_retry_exhausted_total'
	| 'db_tx_lock_timeouts_total'
	| 'db_tx_rollback_failures_total'
	| 'db_tx_client_errors_total'
