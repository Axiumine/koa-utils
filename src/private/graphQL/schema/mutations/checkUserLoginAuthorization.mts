import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { compareHashAsync } from '@lib/hash.mjs'
import { throwForbiddenError } from '@throw/throwForbiddenError.mjs'
import { ClientSession } from 'mongoose'

import { infoUserForLogin } from './infoUserForLogin.mjs'

export async function checkUserLoginAuthorization(
	uEmail: string,
	password: string,
	session: ClientSession
) {
	//console.debug('[checkUserLoginAuthorization] infoUserForLogin')
	const user = await infoUserForLogin(uEmail, session)

	//console.log('[checkUserLoginAuthorization] check 1')
	if (!user.account.email.valid) {
		throw throwForbiddenError()
	}

	const ret = await compareHashAsync(password, user.login.password)

	if (!ret) {
		// console.debug('[checkUserLoginAuthorization] pwd failed')
		throw throwForbiddenError()
	}

	if (user.account.deleted) {
		// console.debug('[checkUserLoginAuthorization] user deleted')
		throw throwForbiddenError()
	}

	if (user.account.disabled) {
		// console.debug('[checkUserLoginAuthorization] user disabled')
		const SocketLabsObj = new SocketLabsLib()
		await SocketLabsObj.accountDisabled(uEmail)
		throw throwForbiddenError()
	}

	return {
		userId: user._id,
		lastLogin: user.login.lastLogin ?? null
	}
}
