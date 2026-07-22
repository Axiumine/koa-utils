import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { checkEmailLen } from '@lib/checkEmailLen.mjs'
import { EMAIL_HASH_LEN } from '@lib/Constants.mjs'
import { DateLib } from '@lib/DateLib.mjs'
import { StringLib } from '@lib/StringLib.mjs'
import { tryCatchRethrow } from '@lib/tryCatchRethrow.mjs'
import { getResetPwd } from '@private/lib/access/db/getResetPwd.mjs'
import { saveResetReq } from '@private/lib/access/db/saveResetReq.mjs'
import * as Sentry from '@sentry/node'
import { GraphQLBoolean, GraphQLError, GraphQLNonNull, GraphQLString } from 'graphql'
import mongoose from 'mongoose'

interface IArgs {
	email: string
}

/** What the committed transaction leaves behind for the post-commit send. */
interface IPendingMail {
	hash: string
	name: string
}

/**
 * Take the user email and send an email with a link for change the password.
 * for privacy, true is returned whatever happens: unknown address, first request, or a request
 * throttled because the previous one is less than 10 minutes old. The caller can never tell them apart,
 * and the mail is queued after the commit without being awaited so the response time does not tell
 * them apart either.
 */
export const resetPwd = {
	description: 'send reset password link',
	type: new GraphQLNonNull(GraphQLBoolean),
	args: {
		email: { type: new GraphQLNonNull(GraphQLString) }
	},
	async resolve(_: unknown, args: IArgs) {
		const { email } = args

		const uEmail = email.toLowerCase().trim()
		checkEmailLen(uEmail)

		// Set only when the transaction actually persisted a fresh reset request. The mail itself goes
		// out after the commit, and is not awaited — see the block below the transaction.
		let pendingMail: IPendingMail | null = null

		const session = await mongoose.startSession()
		try {
			await session.withTransaction(async () => {
				// console.debug('email exists ?')
				// email exists? -> retrieve whether there have already been reset requests -> return 4xx ??
				const resetPwdVal = await getResetPwd(session, uEmail)

				// don't reveal that the email doesn't exist, for privacy
				if (resetPwdVal === null) return
				// console.debug("the email exists")

				// ok, email exists

				// -> wait 10 minutes from the last password reset request

				// if a password request already exists, read the date in seconds.
				const lastReq = typeof resetPwdVal.resetDateReq !== 'undefined' ? new Date('' + resetPwdVal.resetDateReq) : null

				// request already made previously?
				//  send a new email with the recovery link only if the last one is at least 10 minutes old
				const nowDt = new Date()

				// The throttle is enforced silently. Throwing 429 here answered "this address is
				// registered and has a reset pending" to an unauthenticated caller, while an unknown
				// address returned true — an enumeration oracle for any address that had been through
				// this flow. Both cases now return true and send nothing.
				let calculateHash = true
				if (lastReq !== null) {
					// console.debug('reset request already made')
					// console.debug('previous pwd reset request: ' + lastReq + ' it is now ' + nowDt)
					calculateHash = DateLib.minElapsed(lastReq) >= 10
				} //else console.debug('first reset request')

				if (calculateHash) {
					// generate hash for password reset
					const StrObj = new StringLib()
					const hash = StrObj.randomString(EMAIL_HASH_LEN)

					// set hash and current reset date
					await saveResetReq(session, resetPwdVal._id, nowDt, hash)

					// the mail is queued after the commit, not here
					pendingMail = { hash, name: resetPwdVal.name }
				} // calculateHash
			})
		} catch (e: unknown) {
			tryCatchRethrow(e as GraphQLError | Error)
		} finally {
			await session.endSession()
		}

		// Reached only on a committed transaction: tryCatchRethrow above always throws.
		//
		// Three reasons this send sits here and is deliberately not awaited:
		//   1. Timing. Awaiting a network round-trip to SocketLabs made the response measurably slower
		//      exactly when the address was registered and not throttled — the same fact the removed 429
		//      used to state outright. What is left is one extra updateOne, ~a millisecond against
		//      internet jitter, and the 10-minute throttle caps an attacker at one sample per address,
		//      so there is nothing to average out.
		//   2. Retries. session.withTransaction re-runs its callback on a transient error. With the send
		//      inside, a retried commit mailed the user a second link and invalidated the first.
		//   3. Failure disclosure. A SocketLabs outage used to surface as a 500, which only an address
		//      that actually exists could ever receive.
		// The cost is that a delivery failure is now visible in Sentry only, mail in flight is lost if
		// the process is killed before the request settles, and — the one a user feels — the hash is
		// already committed when the send fails, so the 10-minute throttle is armed for a link that
		// never arrived. Clearing resetHash/resetDateReq from the catch below to undo that was
		// considered and rejected: a rejected promise does not prove non-delivery, and a timeout after
		// SocketLabs accepted the message would kill a link already sitting in the user's inbox.
		const mail = pendingMail as IPendingMail | null
		if (mail !== null) {
			try {
				const SocketLabsObj = new SocketLabsLib()
				void SocketLabsObj.sendEmailReset(uEmail, mail.hash, mail.name).catch((e: unknown) => {
					Sentry.captureException(e)
				})
			} catch (e: unknown) {
				// the constructor, or a synchronous throw before the promise exists
				Sentry.captureException(e)
			}
		}

		return true
	}
}
