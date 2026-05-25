import { infoUserAdminForLogin } from '@private/graphQL/schema/mutations/infoUserAdminForLogin.mjs'
import { ClientSession } from 'mongoose'

import { _finalizeLoginCheck } from './_finalizeLoginCheck.mjs'

export async function checkUserAdminLoginAuthorization(uEmail: string, password: string, session: ClientSession) {
	const user = await infoUserAdminForLogin(uEmail, session)

	return _finalizeLoginCheck(user, uEmail, password)
}
