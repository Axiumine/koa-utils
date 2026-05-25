import UserAdminKoaUtils, { IInfoUserAdminForLogin } from '@private/graphQL/models/MongoDB/private/UserAdminKoaUtils.mjs'
import { throwUnauthorizedError } from '@throw/throwUnauthorizedError.mjs'
import { ClientSession } from 'mongoose'

export async function infoUserAdminForLogin(email: string, session: ClientSession): Promise<IInfoUserAdminForLogin> {
	const ret = await UserAdminKoaUtils.findOne({ 'login.email': email })
		.select('_id login.password login.lastLogin account.email.valid account.deleted ' + 'account.disabled')
		.session(session)
		.exec()
	// console.debug('[infoUserForLogin] ret: ', ret);

	if (ret === null) throw throwUnauthorizedError()

	return ret
}
