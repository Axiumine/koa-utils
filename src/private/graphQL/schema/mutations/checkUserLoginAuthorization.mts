import { ClientSession } from 'mongoose'

import { _finalizeLoginCheck } from './_finalizeLoginCheck.mjs'
import { infoUserForLogin } from './infoUserForLogin.mjs'

export async function checkUserLoginAuthorization(uEmail: string, password: string, session: ClientSession) {
	//console.debug('[checkUserLoginAuthorization] infoUserForLogin')
	const user = await infoUserForLogin(uEmail, session)

	return _finalizeLoginCheck(user, uEmail, password)
}
