// safe: concatenation builds only the static clause; values go through replacements.
// Guards the broadened concat source against flagging parameterized queries.
import { sequelize } from '../stub'
export async function ok(id: number, table: 'user') {
	const sql = 'UPDATE ' + table + ' SET lastlogin = :ts WHERE id = :id'
	return sequelize.query(sql, { replacements: { ts: '2020-01-01', id } })
}
