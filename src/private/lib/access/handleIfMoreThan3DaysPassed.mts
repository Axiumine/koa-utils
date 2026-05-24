import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { StringLib } from '@lib/StringLib.mjs'

import { EMAIL_CHECK_LINK } from './Constants.mjs'
import deleteUserByEmail from './db/deleteUserByEmail.mjs'

export async function handleIfMoreThan3DaysPassed(
	uEmail: string,
	dateLastReq: Date = new Date() // but it is already handled
) {
	/****************************************************
	 * if dateLastReq too old then 3 days send email
	 */

	const now = new Date()
	const day3ago = new Date(now.setDate(now.getDate() - 3))
	const StrLibObj = new StringLib()
	const tsReq = StrLibObj.isoToTimestamp(dateLastReq)
	const ts3DayAgo = StrLibObj.isoToTimestamp(day3ago)

	if (ts3DayAgo > tsReq) {
		// dateLastReq too old then 3 days
		const SocketLabsObj = new SocketLabsLib()
		await SocketLabsObj.hashReqTooOld(uEmail)

		await deleteUserByEmail(uEmail)

		throw new Error(EMAIL_CHECK_LINK)
	}
}
