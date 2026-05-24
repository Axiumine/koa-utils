import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { compareHashAsync } from '@lib/hash.mjs'
import { infoUserAdminForLogin } from '@private/graphQL/schema/mutations/infoUserAdminForLogin.mjs'
import { throwForbiddenError } from '@throw/throwForbiddenError.mjs'
import { ClientSession } from 'mongoose'

export async function checkUserAdminLoginAuthorization(
	uEmail: string,
	password: string,
	session: ClientSession
) {
	const user = await infoUserAdminForLogin(uEmail, session)

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
