import { Types } from 'mongoose'

import { handleBadDB } from './handleBadDB.mjs'
import { handleIfAccountDeleted } from './handleIfAccountDeleted.mjs'
import { handleIfAccountDisabled } from './handleIfAccountDisabled.mjs'
import { handleIfEmailAlreadyValid } from './handleIfEmailAlreadyValid.mjs'
import { handleIfHashBad } from './handleIfHashBad.mjs'
import { handleIfMoreThan3DaysPassed } from './handleIfMoreThan3DaysPassed.mjs'
import { handleIfTooMuchRequestsTimes } from './handleIfTooMuchRequestsTimes.mjs'

/** The projection userData4VerifyEmail selects, as the guard chain needs it. */
export interface IVerifyEmailUser {
	_id: Types.ObjectId
	account: {
		email: {
			hash?: string
			valid: boolean
			dateLastReq?: Date
			requestTimes?: number
		}
		deleted?: boolean
		disabled?: boolean
	}
}

/**
 * Run every guard that must pass before an email-verification link is honoured, in order.
 *
 * Extracted from routerVerifyEmail so the sequence is reachable by tests. Inside the
 * router it was not: the handler's only entry point performs a DB read, which cannot be
 * stubbed under the tsx loader (ESM live bindings), so in the suite it always rejected
 * and the whole try-body was dead code — sitting under a `c8 ignore` besides. Mutation
 * testing confirmed the cost: deleting the disabled-account guard, negating the deleted
 * flag, comparing the URL hash against ITSELF instead of the stored one, hard-coding
 * requestTimes to 0, and dropping the `await` on the hash check ALL left the suite green.
 * Each guard had thorough unit tests of its own; nothing tested that the router called
 * them, with the right values, in the right order.
 *
 * Throws (via the handleIf* guards) when the link must not be honoured. Returns the user
 * id to enable when every guard passes.
 *
 * Enabling the account is deliberately NOT done here. The caller performs it on the
 * returned id, so the irreversible side effect cannot be reordered ahead of a guard —
 * a mutation that did exactly that also survived.
 */
export async function assertVerifyEmailAllowed(user: IVerifyEmailUser, email: string, hash: string): Promise<Types.ObjectId> {
	const uId = user._id
	const userAccount = user.account
	const userAccountEmail = userAccount.email
	const requestTimes = userAccountEmail.requestTimes
	const dateLastReq = userAccountEmail.dateLastReq
	const { deleted, disabled } = userAccount

	await handleIfEmailAlreadyValid(email, userAccountEmail.valid)
	handleBadDB(requestTimes, dateLastReq)
	await handleIfTooMuchRequestsTimes(email, requestTimes)
	// dbHash is the value STORED for this account — never the one supplied in the URL
	await handleIfHashBad({ uId, uEmail: email, hash, requestTimes, dbHash: userAccountEmail.hash })

	await handleIfMoreThan3DaysPassed(email, dateLastReq)
	await handleIfAccountDeleted(email, deleted)
	await handleIfAccountDisabled(email, disabled)

	return uId
}
