import { defaultVerifyEmailMailer, IVerifyEmailMailer } from '@lib/access/verifyEmailMailer.mjs'

import { EMAIL_CHECK_LINK } from './Constants.mjs'

/**
 * The account carries the tombstone flag.
 *
 * Sends `accountDisabled`, not an `accountDeleted` of its own: `SocketLabsLib` has no such template, so a
 * deleted account is told it is disabled. That is the shipped copy, left as it is here on purpose — this is
 * the guard, not the place to invent a message.
 *
 * Like every other counter-less branch it mails on each request, which is why the mailer is injected rather
 * than constructed here.
 */
export const createHandleIfAccountDeleted = (mailer: IVerifyEmailMailer) =>
	async function handleIfAccountDeleted(email: string, deleted: boolean = false) {
		if (deleted) {
			await mailer.accountDisabled(email)
			throw new Error(EMAIL_CHECK_LINK)
		}
	}

/** Signature of the bound guard, for the modules that take it as a dependency. */
export type THandleIfAccountDeleted = ReturnType<typeof createHandleIfAccountDeleted>

/** `UserBase`-bound default — the behaviour every existing consumer already imports, now debounced. */
export const handleIfAccountDeleted: THandleIfAccountDeleted = createHandleIfAccountDeleted(defaultVerifyEmailMailer)
