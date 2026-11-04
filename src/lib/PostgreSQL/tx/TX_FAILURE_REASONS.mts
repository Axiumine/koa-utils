/**
 * The closed reasons of the error that `withTx` asks its error factory for (`internal(reason)`):
 *
 * - `TX_RETRY_EXHAUSTED`: the transaction failed with SQLSTATE 40001 or 40P01 on every attempt, the retries included.
 * - `LOCK_TIMEOUT`: a statement waited longer than the lock timeout (SQLSTATE 55P03). It is not retried.
 */
export const TX_FAILURE_REASONS = ['TX_RETRY_EXHAUSTED', 'LOCK_TIMEOUT'] as const
