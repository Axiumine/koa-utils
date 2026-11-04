/**
 * The database time as a SQL expression of type `timestamptz`, for a statement that decides inside the database (a lease
 * that compares with it, say). It is the expression {@link CLOCK_SQL} reads.
 */
export const DB_NOW_SQL = 'clock_timestamp()'
