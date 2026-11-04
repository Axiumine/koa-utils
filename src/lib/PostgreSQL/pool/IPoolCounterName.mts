/**
 * The counters the pool factory increments:
 *
 * - `db_pool_idle_client_errors_total`: an idle client of the pool emitted an `error` event.
 * - `db_pool_connect_failures_total`: a connection, its login or its session check failed.
 */
export type IPoolCounterName = 'db_pool_idle_client_errors_total' | 'db_pool_connect_failures_total'
