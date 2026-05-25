import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { compareHashAsync } from '@lib/hash.mjs'
import { throwForbiddenError } from '@throw/throwForbiddenError.mjs'
import { Types } from 'mongoose'

export interface ILoginUserShape {
	_id: Types.ObjectId
	login: { password: string; lastLogin?: Date }
	account: { email: { valid: boolean }; disabled?: boolean; deleted?: boolean }
}

export async function _finalizeLoginCheck(user: ILoginUserShape, uEmail: string, password: string) {
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
