import { defaultVerifyEmailMailer, IVerifyEmailMailer } from '@lib/access/verifyEmailMailer.mjs'

import { EMAIL_CHECK_LINK } from './Constants.mjs'

/**
 * The address in the link is already verified.
 *
 * The notification goes through an injected mailer, so the branch becomes drivable from an integration suite
 * without a real send — the SocketLabs client used to be constructed right here, so reaching this path with
 * real credentials mailed a real person. It also gives the debounce somewhere to live: this guard has no
 * counter behind it, so an unauthenticated GET mails the address once per request, for as many requests as
 * the caller cares to make.
 */
export const createHandleIfEmailAlreadyValid = (mailer: IVerifyEmailMailer) =>
	async function handleIfEmailAlreadyValid(uEmail: string, valid: boolean) {
		if (valid) {
			await mailer.emailAlreadyValid(uEmail)
			throw new Error(EMAIL_CHECK_LINK)
		}
	}

/** Signature of the bound guard, for the modules that take it as a dependency. */
export type THandleIfEmailAlreadyValid = ReturnType<typeof createHandleIfEmailAlreadyValid>

/** `UserBase`-bound default — the behaviour every existing consumer already imports, now debounced. */
export const handleIfEmailAlreadyValid: THandleIfEmailAlreadyValid = createHandleIfEmailAlreadyValid(defaultVerifyEmailMailer)
