import { SocketLabsLib } from '@email/SocketLabsLib.mjs'

/**
 * Every notification the email-verification chain sends.
 *
 * Each guard used to construct its own `SocketLabsLib` inline, which made no branch of the chain drivable
 * from an integration suite: with real credentials in `.env` the only two paths reachable without mailing
 * a real person were "address not found" and the bad-DB guard. Everything else was unit-tests-with-mocks
 * only — including the success path, since `enableEmailAccess` sent the welcome mail itself.
 *
 * Structural, not nominal: any object carrying these six methods satisfies it, `SocketLabsLib` included.
 */
export interface IVerifyEmailMailer {
	/** The address is already verified. */
	emailAlreadyValid(email: string): Promise<unknown>
	/** The hash in the link does not match the stored one. `times` is the strike this attempt makes. */
	wrongHash(email: string, times: number): Promise<unknown>
	/** The strike counter reached 5. */
	tooMuchVerifyRequests(email: string): Promise<unknown>
	/** The link is older than the 3-day window. */
	hashReqTooOld(email: string): Promise<unknown>
	/** The account is disabled — or deleted: there is no `accountDeleted` template, so both guards send this one. */
	accountDisabled(email: string): Promise<unknown>
	/** The account has just been activated. Success path only. */
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
 * What the `UserBase`-bound guard exports mail through.
 *
 * One value for the whole process, because these bindings are one shared chain — the `routerVerifyEmail`
 * export every existing consumer imports. `createVerifyEmailFlow` does not use it; it takes its own.
 */
export const defaultVerifyEmailMailer: IVerifyEmailMailer = socketLabsVerifyEmailMailer
