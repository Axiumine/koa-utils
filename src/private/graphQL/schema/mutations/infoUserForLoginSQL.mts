import { sequelize } from '@dataSources/MariaDB.mjs'
import { throwErrorWrongUserInput } from '@throw/throwErrorWrongUserInput.mjs'
import { QueryTypes } from 'sequelize'

export type InfoUserForLoginSQL = {
	id: number
	password: string
	valid: boolean
	deleted: boolean
	disabled: boolean
}

export async function infoUserForLoginSQL(email: string): Promise<InfoUserForLoginSQL> {
	const sql = 'SELECT id, password, valid, deleted, disabled FROM user WHERE email=:email'

	let ret: InfoUserForLoginSQL[] = (await sequelize.query(sql, {
		type: QueryTypes.SELECT,
		replacements: {
			email: email
		}
	})) as InfoUserForLoginSQL[]

	if (ret.length === 0) throw throwErrorWrongUserInput('User does not exist')

	return ret[0]
}
