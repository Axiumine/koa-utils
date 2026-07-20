// expect: koa-utils.sql-injection.raw-query-interpolation
import { sequelize } from '../stub'
export async function bad(id: string) {
	const sql = `UPDATE user SET lastlogin = NOW() WHERE id = ${id}`
	return sequelize.query(sql, { type: 'UPDATE' })
}
