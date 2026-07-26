import { defaultVerifyEmailMailer, IVerifyEmailMailer } from '@lib/access/verifyEmailMailer.mjs'

import { EMAIL_CHECK_LINK } from './Constants.mjs'

/**
 * The address in the link is already verified.
 *
 * The notification goes through an injected mailer, which buys two things. The branch becomes drivable from
 * an integration suite without a real send — the SocketLabs client used to be constructed right here, so
 * reaching this path with real credentials mailed a real person. And the debounce gets somewhere to live:
 * this guard has no counter behind it, so through 5.6.1 an unauthenticated GET mailed the address once per
 * request, for as many requests as the caller cared to make. `defaultVerifyEmailMailer` is throttled — see
 * `createMailThrottle`.
 *
 * A suppressed mail changes nothing the caller can observe: the throw, and so the redirect, is unconditional.
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
