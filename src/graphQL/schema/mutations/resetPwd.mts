import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { checkEmailLen } from '@lib/checkEmailLen.mjs'
import { EMAIL_HASH_LEN } from '@lib/Constants.mjs'
import { DateLib } from '@lib/DateLib.mjs'
import { StringLib } from '@lib/StringLib.mjs'
import { tryCatchRethrow } from '@lib/tryCatchRethrow.mjs'
import { getResetPwd } from '@private/lib/access/db/getResetPwd.mjs'
import { saveResetReq } from '@private/lib/access/db/saveResetReq.mjs'
import { throwTooManyRequestsError } from '@throw/throwTooManyRequestsError.mjs'
import { GraphQLBoolean, GraphQLError, GraphQLNonNull, GraphQLString } from 'graphql'
import mongoose from 'mongoose'

interface IArgs {
	email: string
}

/**
 * Take the user email and send an email with a link for change the password.
 * for privacy, true is returned if given email do not exist
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

		const session = await mongoose.startSession()
		try {
			await session.withTransaction(async () => {
				// console.debug('email exists ?')
				// email exists? -> retrieve whether there have already been reset requests -> return 4xx ??
				const resetPwdVal = await getResetPwd(session, uEmail)

				// don't reveal that the email doesn't exist, for privacy
				if (resetPwdVal !== null) {
					// console.debug("the email exists")

					// ok, email exists

					// -> wait 10 minutes from the last password reset request

					// if a password request already exists, read the date in seconds.
					const lastReq = typeof resetPwdVal.resetDateReq !== 'undefined' ? new Date('' + resetPwdVal.resetDateReq) : null

					// request already made previously?
					//  send a new email with the recovery link if it was sent less than 10 minutes ago
					let elapsedMin = 0
					const nowDt = new Date()

					let calculateHash = false
					if (lastReq !== null) {
						// console.debug('reset request already made')
						elapsedMin = DateLib.minElapsed(lastReq)

						// console.debug('previous pwd reset request: ' + lastReq + ' it is now ' + now + ' and ' + elapsedMin + ' minutes have passed')
						// if a password reset request has already been made, at least 10 minutes must have passed
						if (elapsedMin < 10) {
							// console.debug('last req < 10 min')
							// Don't reveal that the email was found and
							elapsedMin = 10 - elapsedMin
							/* c8 ignore next -- defensive: 10-elapsedMin is always >= 0 inside this branch */
							if (elapsedMin < 0) elapsedMin = 1 // to round up the seconds of the last minute, set minute = 1
							// console.debug('wait ' + message + ' min ' + uEmail)
							throw throwTooManyRequestsError(elapsedMin.toString())
						} else {
							// ok, more than 10 minutes, so generate hash for new email
							calculateHash = true
						}
					} else {
						//console.debug('first reset request')
						calculateHash = true
					}

					if (calculateHash) {
						// generate hash for password reset
						const StrObj = new StringLib()
						const hash = StrObj.randomString(EMAIL_HASH_LEN)

						// set hash and current reset date
						await saveResetReq(session, resetPwdVal._id, nowDt, hash)

						// send email with new hash, last request > 10 minutes ago
						const SocketLabsObj = new SocketLabsLib()
						await SocketLabsObj.sendEmailReset(uEmail, hash, resetPwdVal.name)
					} // calculateHash & sendEmail
				}
			})
		} catch (e: unknown) {
			tryCatchRethrow(e as GraphQLError | Error)
		} finally {
			await session.endSession()
		}

		return true
	}
}
