/** The log field for a SQLSTATE: present only when there is a safe one (see `sqlstateOf`). */
export function sqlstateField(sqlstate: string | undefined): { sqlstate?: string } {
	return sqlstate === undefined ? {} : { sqlstate }
}
