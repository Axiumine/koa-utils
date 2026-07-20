// VULNERABLE, currently silent.
// The rule's pattern-source only matches backtick template-literal interpolation,
// so ordinary string concatenation into sequelize.query is invisible.
import { sequelize } from '../stub'
export async function bad(id: string) {
	const sql = 'UPDATE user SET lastlogin = NOW() WHERE id = ' + id
	return sequelize.query(sql, { type: 'UPDATE' })
}
