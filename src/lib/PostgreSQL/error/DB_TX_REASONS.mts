/**
 * The closed reasons of a misuse of a transaction (see {@link DbTxError}), both a defect of the calling code:
 *
 * - `HANDLE_CLOSED`: a statement was sent through the handle of a transaction that has already committed, rolled back
 *   or started to commit. The handle would otherwise reach a connection that the pool has handed to someone else.
 * - `COMMIT_ROLLED_BACK`: the server answered `COMMIT` with the command tag `ROLLBACK`, which is what it does for a
 *   transaction that a failed statement had aborted, and no failed statement of the handle is known to say why.
 */
export const DB_TX_REASONS = ['HANDLE_CLOSED', 'COMMIT_ROLLED_BACK'] as const
