/**
 * The counters `mapDbError` increments, and the second one also `guardVersion`:
 *
 * - `db_constraint_unmapped_total`: a violation named a constraint that the table does not hold (reason `CONSTRAINT_UNMAPPED`).
 * - `db_error_internal_total`: any other failure that became the internal error.
 */
export type IDbErrorCounterName = 'db_constraint_unmapped_total' | 'db_error_internal_total'
