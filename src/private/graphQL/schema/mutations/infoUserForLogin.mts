import { IInfoUserForLogin, UserBase } from '@models/MongoDB/UserBase.mjs'
import { throwUnauthorizedError } from '@throw/throwUnauthorizedError.mjs'
import { ClientSession } from 'mongoose'

export async function infoUserForLogin(
	email: string,
	session: ClientSession
): Promise<IInfoUserForLogin> {
	const ret = await UserBase.findOne({ 'login.email': email })
		.select(
			'_id login.password login.lastLogin account.email.valid account.deleted ' +
			'account.disabled'
		)
		.session(session)
		.exec()
	// console.debug('[infoUserForLogin] ret: ', ret);

	if (ret === null) throw throwUnauthorizedError()

	return ret
}
