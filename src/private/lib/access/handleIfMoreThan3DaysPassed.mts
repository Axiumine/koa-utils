import { defaultVerifyEmailMailer, IVerifyEmailMailer } from '@lib/access/verifyEmailMailer.mjs'
import { StringLib } from '@lib/StringLib.mjs'

import { EMAIL_CHECK_LINK } from './Constants.mjs'
import deleteUserByEmail, { TDeleteUserByEmail } from './db/deleteUserByEmail.mjs'

/**
 * A verification link older than 3 days disposes of the pending account.
 *
 * Disposal runs through an injected writer so the guard can serve a model other than `UserBase`, and so the
 * *policy* is the caller's: hard delete, tombstone flag or nothing. See `createAbandonUser`. The guard throws
 * either way — what happens to the row never changes whether the link is honoured.
 *
 * The mail goes through an injected mailer, which also carries the debounce on the default binding.
 */
export const createHandleIfMoreThan3DaysPassed = (deleteUserByEmailFn: TDeleteUserByEmail, mailer: IVerifyEmailMailer) =>
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
			await mailer.hashReqTooOld(uEmail)

			await deleteUserByEmailFn(uEmail)

			throw new Error(EMAIL_CHECK_LINK)
		}
	}

/** Signature of the bound guard, for the modules that take it as a dependency. */
export type THandleIfMoreThan3DaysPassed = ReturnType<typeof createHandleIfMoreThan3DaysPassed>

/** `UserBase`-bound default — the behaviour every existing consumer already imports. */
export const handleIfMoreThan3DaysPassed: THandleIfMoreThan3DaysPassed = createHandleIfMoreThan3DaysPassed(
	deleteUserByEmail,
	defaultVerifyEmailMailer
)
