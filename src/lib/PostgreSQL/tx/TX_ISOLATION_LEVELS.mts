/** The isolation levels `withTx` opens. `READ UNCOMMITTED` is the server's alias of `READ COMMITTED` and is not offered. */
export const TX_ISOLATION_LEVELS = ['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'] as const
