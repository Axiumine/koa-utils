import { SocketLabsLib } from '@email/SocketLabsLib.mjs'

import { EMAIL_CHECK_LINK } from './Constants.mjs'

export async function handleIfEmailAlreadyValid(
	uEmail: string,
	valid: boolean
) {
	if (valid) {
		const SocketLabsObj = new SocketLabsLib()

		await SocketLabsObj.emailAlreadyValid(uEmail)
		throw new Error(EMAIL_CHECK_LINK)
	}
}
