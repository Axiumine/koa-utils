import { defaultVerifyEmailMailer, IVerifyEmailMailer } from '@lib/access/verifyEmailMailer.mjs'

import { EMAIL_CHECK_LINK } from './Constants.mjs'

/**
 * The account carries the lockout flag.
 *
 * Byte-identical to `handleIfAccountDeleted` apart from the flag it reads, because there is only one
 * template for both states. Kept as two guards so the chain reads as the two distinct conditions it checks.
 *
 * Counter-less like the rest, so the mailer is injected and the default one is debounced. See
 * `createMailThrottle`.
 */
export const createHandleIfAccountDisabled = (mailer: IVerifyEmailMailer) =>
	async function handleIfAccountDisabled(email: string, disabled: boolean = false) {
		if (disabled) {
			await mailer.accountDisabled(email)
			throw new Error(EMAIL_CHECK_LINK)
		}
	}

/** Signature of the bound guard, for the modules that take it as a dependency. */
export type THandleIfAccountDisabled = ReturnType<typeof createHandleIfAccountDisabled>

/** `UserBase`-bound default — the behaviour every existing consumer already imports, now debounced. */
export const handleIfAccountDisabled: THandleIfAccountDisabled = createHandleIfAccountDisabled(defaultVerifyEmailMailer)
