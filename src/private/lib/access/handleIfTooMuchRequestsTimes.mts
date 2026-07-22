import { SocketLabsLib } from '@email/SocketLabsLib.mjs'

import { EMAIL_CHECK_LINK } from './Constants.mjs'
import deleteUserByEmail, { TDeleteUserByEmail } from './db/deleteUserByEmail.mjs'

/**
 * Five wrong-hash attempts delete the pending account.
 *
 * The delete runs through an injected writer so the guard can serve a model other than `UserBase`:
 * both the collection and the login-email path come from the writer it was built with.
 */
export const createHandleIfTooMuchRequestsTimes = (deleteUserByEmailFn: TDeleteUserByEmail) =>
	async function handleIfTooMuchRequestsTimes(
		uEmail: string,
		requestTimes: number = 99 // but it is already handled
	) {
		if (requestTimes >= 5) {
			const SocketLabsObj = new SocketLabsLib()
			await SocketLabsObj.tooMuchVerifyRequests(uEmail)

			await deleteUserByEmailFn(uEmail)

			throw new Error(EMAIL_CHECK_LINK)
		}
	}

/** Signature of the bound guard, for the modules that take it as a dependency. */
export type THandleIfTooMuchRequestsTimes = ReturnType<typeof createHandleIfTooMuchRequestsTimes>

/** `UserBase`-bound default — the behaviour every existing consumer already imports. */
export const handleIfTooMuchRequestsTimes: THandleIfTooMuchRequestsTimes = createHandleIfTooMuchRequestsTimes(deleteUserByEmail)
