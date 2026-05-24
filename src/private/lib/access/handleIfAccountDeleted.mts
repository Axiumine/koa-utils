import { SocketLabsLib } from '@email/SocketLabsLib.mjs'

import { EMAIL_CHECK_LINK } from './Constants.mjs'

export async function handleIfAccountDeleted(
	email: string,
	deleted: boolean = false
) {
	if (deleted) {
		const SocketLabsObj = new SocketLabsLib()

		await SocketLabsObj.accountDisabled(email)
		throw new Error(EMAIL_CHECK_LINK)
	}
}
