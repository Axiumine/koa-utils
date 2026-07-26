import { SocketLabsLib } from '@email/SocketLabsLib.mjs'

import { createMailThrottle, TMailThrottle } from './createMailThrottle.mjs'

/**
 * Every notification the email-verification chain sends.
 *
 * Each guard used to construct its own `SocketLabsLib` inline, which made no branch of the chain drivable
 * from an integration suite: with real credentials in `.env` the only two paths reachable without mailing
 * a real person were "address not found" and the bad-DB guard. Everything else was unit-tests-with-mocks
 * only — including the success path, since `enableEmailAccess` sent the welcome mail itself.
 *
 * Structural, not nominal: any object carrying these six methods satisfies it, `SocketLabsLib` included.
 * `sendWelcome` is the only one not reachable unauthenticated, and the only one the debounce leaves alone.
 */
export interface IVerifyEmailMailer {
	/** The address is already verified. No counter guards this branch — see {@link createMailThrottle}. */
	emailAlreadyValid(email: string): Promise<unknown>
	/** The hash in the link does not match the stored one. `times` is the strike this attempt makes. */
	wrongHash(email: string, times: number): Promise<unknown>
	/** The strike counter reached 5. */
	tooMuchVerifyRequests(email: string): Promise<unknown>
	/** The link is older than the 3-day window. */
	hashReqTooOld(email: string): Promise<unknown>
	/** The account is disabled — or deleted: there is no `accountDeleted` template, so both guards send this one. */
	accountDisabled(email: string): Promise<unknown>
	/** The account has just been activated. Success path only, so never debounced. */
	sendWelcome(email: string): Promise<unknown>
}

/**
 * SocketLabs, constructed per call exactly as the guards did inline.
 *
 * Per call rather than once at module load because the constructor reads `process.env` (server id, API key,
 * platform name, domain, sender) and builds a client from it — hoisting that to import time would pin
 * whatever the environment held when the module was first resolved.
 */
export const socketLabsVerifyEmailMailer: IVerifyEmailMailer = {
	emailAlreadyValid: (email) => new SocketLabsLib().emailAlreadyValid(email),
	wrongHash: (email, times) => new SocketLabsLib().wrongHash(email, times),
	tooMuchVerifyRequests: (email) => new SocketLabsLib().tooMuchVerifyRequests(email),
	hashReqTooOld: (email) => new SocketLabsLib().hashReqTooOld(email),
	accountDisabled: (email) => new SocketLabsLib().accountDisabled(email),
	sendWelcome: (email) => new SocketLabsLib().sendWelcome(email)
}

/**
 * Wrap a mailer so each guard notification is asked of `throttle` first, keyed `<method>:<address>`.
 *
 * A dropped send resolves `undefined` and is invisible to the caller: the guard still throws, so the
 * request still gets the same redirect it always did. Only the mail is suppressed.
 *
 * `sendWelcome` passes straight through. It fires once, on the success path, at the moment the account is
 * activated — debouncing it could silently swallow the welcome mail of an address that re-registered
 * inside the window, and no unauthenticated caller can trigger it twice anyway (the second request meets
 * `handleIfEmailAlreadyValid`).
 */
export const throttleMailer = (mailer: IVerifyEmailMailer, throttle: TMailThrottle): IVerifyEmailMailer => {
	const gated = async (kind: string, email: string, deliver: () => Promise<unknown>): Promise<unknown> =>
		(await throttle(`${kind}:${email}`)) ? deliver() : undefined

	return {
		emailAlreadyValid: (email) => gated('emailAlreadyValid', email, () => mailer.emailAlreadyValid(email)),
		wrongHash: (email, times) => gated('wrongHash', email, () => mailer.wrongHash(email, times)),
		tooMuchVerifyRequests: (email) => gated('tooMuchVerifyRequests', email, () => mailer.tooMuchVerifyRequests(email)),
		hashReqTooOld: (email) => gated('hashReqTooOld', email, () => mailer.hashReqTooOld(email)),
		accountDisabled: (email) => gated('accountDisabled', email, () => mailer.accountDisabled(email)),
		sendWelcome: (email) => mailer.sendWelcome(email)
	}
}

/**
 * What the `UserBase`-bound guard exports mail through: SocketLabs, debounced on the default window.
 *
 * One shared throttle for the whole process, because these bindings are one shared chain — the
 * `routerVerifyEmail` export every existing consumer imports. `createVerifyEmailFlow` does not use this
 * value; it builds its own mailer and its own throttle per flow.
 */
export const defaultVerifyEmailMailer: IVerifyEmailMailer = throttleMailer(socketLabsVerifyEmailMailer, createMailThrottle())
