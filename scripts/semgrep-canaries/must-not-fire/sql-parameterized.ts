// safe: mirrors src/private/graphQL/schema/mutations/setLastLoginSQL.mts
import { sequelize } from '../stub'
export async function ok(id: number) {
	const sql = 'UPDATE user SET lastlogin = :ts WHERE id = :id'
	return sequelize.query(sql, { replacements: { ts: '2020-01-01', id } })
}
