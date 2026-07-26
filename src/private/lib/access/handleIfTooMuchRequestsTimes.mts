import { defaultVerifyEmailMailer, IVerifyEmailMailer } from '@lib/access/verifyEmailMailer.mjs'

import { EMAIL_CHECK_LINK } from './Constants.mjs'
import deleteUserByEmail, { TDeleteUserByEmail } from './db/deleteUserByEmail.mjs'

/**
 * Five wrong-hash attempts dispose of the pending account.
 *
 * Disposal runs through an injected writer so the guard can serve a model other than `UserBase`, and so the
 * *policy* is the caller's: hard delete, tombstone flag or nothing. See `createAbandonUser`. Under `'keep'`
 * the strike count keeps climbing past 5, so this branch repeats — which is the other reason the mail is
 * injected and the default binding is debounced.
 */
export const createHandleIfTooMuchRequestsTimes = (deleteUserByEmailFn: TDeleteUserByEmail, mailer: IVerifyEmailMailer) =>
	async function handleIfTooMuchRequestsTimes(
		uEmail: string,
		requestTimes: number = 99 // but it is already handled
	) {
		if (requestTimes >= 5) {
			await mailer.tooMuchVerifyRequests(uEmail)

			await deleteUserByEmailFn(uEmail)

			throw new Error(EMAIL_CHECK_LINK)
		}
	}

/** Signature of the bound guard, for the modules that take it as a dependency. */
export type THandleIfTooMuchRequestsTimes = ReturnType<typeof createHandleIfTooMuchRequestsTimes>

/** `UserBase`-bound default — the behaviour every existing consumer already imports. */
export const handleIfTooMuchRequestsTimes: THandleIfTooMuchRequestsTimes = createHandleIfTooMuchRequestsTimes(
	deleteUserByEmail,
	defaultVerifyEmailMailer
)
