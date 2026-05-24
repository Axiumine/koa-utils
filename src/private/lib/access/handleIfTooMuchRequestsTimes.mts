import { SocketLabsLib } from '@email/SocketLabsLib.mjs'

import { EMAIL_CHECK_LINK } from './Constants.mjs'
import deleteUserByEmail from './db/deleteUserByEmail.mjs'

export async function handleIfTooMuchRequestsTimes(
	uEmail: string,
	requestTimes: number = 99 // but it is already handled
) {
	if (requestTimes >= 5) {
		const SocketLabsObj = new SocketLabsLib()
		await SocketLabsObj.tooMuchVerifyRequests(uEmail)

		await deleteUserByEmail(uEmail)

		throw new Error(EMAIL_CHECK_LINK)
	}
}
