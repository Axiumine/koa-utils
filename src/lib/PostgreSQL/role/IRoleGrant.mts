/** One privilege the role is expected to hold. */
export interface IRoleGrant {
	/**
	 * What the privilege is on, as the catalog names it: `app` (a schema), `app.orders` (a table, a view or a sequence)
	 * or `app.resolve_token` (every function of that name, arguments not given).
	 */
	readonly object: string
	/**
	 * `USAGE` or `CREATE` on a schema; `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES` or `TRIGGER` on a
	 * table (`USAGE`, `SELECT` and `UPDATE` on a sequence); `EXECUTE` on a function.
	 */
	readonly privilege: string
	/**
	 * For `SELECT`, `INSERT`, `UPDATE` or `REFERENCES` on a table: the columns the role needs the privilege on. The check
	 * is `has_column_privilege` for each, which a table-level grant also satisfies. Without it, the check is
	 * `has_table_privilege`, which a column-level grant does not satisfy.
	 */
	readonly columns?: readonly string[]
}
