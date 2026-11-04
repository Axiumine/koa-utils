/**
 * The statement of a clock: one row, one `bigint` column `ms`. `clock_timestamp()` is the wall clock at the moment the
 * statement runs (unlike `now()` and `transaction_timestamp()`, which stay at the start of the transaction), as epoch
 * milliseconds cut toward zero by `trunc` (a cast to `bigint` would round). `extract(epoch FROM <timestamptz>)` does not
 * depend on the session time zone. It takes no parameter: no time is bound from the process.
 */
export const CLOCK_SQL = 'SELECT trunc(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS ms'
