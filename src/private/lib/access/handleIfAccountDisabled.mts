import { SocketLabsLib } from '@email/SocketLabsLib.mjs'

import { EMAIL_CHECK_LINK } from './Constants.mjs'

export async function handleIfAccountDisabled(
	email: string,
	disabled: boolean = false
) {
	if (disabled) {
		const SocketLabsObj = new SocketLabsLib()

		await SocketLabsObj.accountDisabled(email)
		throw new Error(EMAIL_CHECK_LINK)
	}
}
