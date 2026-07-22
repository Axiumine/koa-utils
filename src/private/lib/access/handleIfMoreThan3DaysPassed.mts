import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { StringLib } from '@lib/StringLib.mjs'

import { EMAIL_CHECK_LINK } from './Constants.mjs'
import deleteUserByEmail, { TDeleteUserByEmail } from './db/deleteUserByEmail.mjs'

/**
 * A verification link older than 3 days deletes the pending account.
 *
 * The delete runs through an injected writer so the guard can serve a model other than `UserBase`:
 * both the collection and the login-email path come from the writer it was built with.
 */
export const createHandleIfMoreThan3DaysPassed = (deleteUserByEmailFn: TDeleteUserByEmail) =>
	async function handleIfMoreThan3DaysPassed(
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

			await deleteUserByEmailFn(uEmail)

			throw new Error(EMAIL_CHECK_LINK)
		}
	}

/** Signature of the bound guard, for the modules that take it as a dependency. */
export type THandleIfMoreThan3DaysPassed = ReturnType<typeof createHandleIfMoreThan3DaysPassed>

/** `UserBase`-bound default — the behaviour every existing consumer already imports. */
export const handleIfMoreThan3DaysPassed: THandleIfMoreThan3DaysPassed = createHandleIfMoreThan3DaysPassed(deleteUserByEmail)
