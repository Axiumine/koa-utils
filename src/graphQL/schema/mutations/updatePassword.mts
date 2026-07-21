import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { checkEmailLen } from '@lib/checkEmailLen.mjs'
import { checkPwdLen } from '@lib/checkPwdLen.mjs'
import { DateLib } from '@lib/DateLib.mjs'
import { tryCatchRethrow } from '@lib/tryCatchRethrow.mjs'
import { getResetPwd } from '@private/lib/access/db/getResetPwd.mjs'
import removeResetReq from '@private/lib/access/db/removeResetReq.mjs'
import updatePasswordDb from '@private/lib/access/db/updatePasswordDb.mjs'
import { throwForbiddenError } from '@throw/throwForbiddenError.mjs'
import { throwInternalError } from '@throw/throwInternalError.mjs'
import { GraphQLBoolean, GraphQLError, GraphQLNonNull, GraphQLString } from 'graphql'
import mongoose from 'mongoose'

interface IArgs {
	email: string
	hash: string
	password: string
}

export const updatePassword = {
	description: "changes the user's password",
	type: new GraphQLNonNull(GraphQLBoolean),
	args: {
		email: { type: new GraphQLNonNull(GraphQLString) },
		hash: { type: new GraphQLNonNull(GraphQLString) },
		password: { type: new GraphQLNonNull(GraphQLString) }
	},
	async resolve(_: unknown, args: IArgs) {
		const { email, hash, password } = args

		const uEmail = email.trim().toLowerCase()
		checkEmailLen(uEmail)
		checkPwdLen(password)

		const session = await mongoose.startSession()

		try {
			await session.withTransaction(async () => {
				const resetPwd = await getResetPwd(session, uEmail)

				// check if email is present in db
				if (resetPwd === null) {
					throw throwForbiddenError() // don't reveal whether the email is present, for privacy
				}
				// console.debug('--email present')

				if (resetPwd.resetHash === null) {
					throw throwInternalError()
				}
				/* c8 ignore next 3 -- defensive guard, resetDateReq cannot be null when resetHash is set */
				if (resetPwd.resetDateReq === null) {
					throw throwInternalError() // throwSoftwareError('resetDateReq missing !')
				}

				// check if hash is missing or invalid
				if (resetPwd.resetHash !== hash) {
					throw throwForbiddenError() // don't reveal whether the email is present, for privacy
				} // else console.debug('--hash valid')

				// check if the request was made within 1 hour
				const dt1 = new Date('' + resetPwd.resetDateReq)
				if (DateLib.minElapsed(dt1) > 60) {
					throw throwForbiddenError() // The link is no longer valid
				} // else console.debug('--link valid')

				const update = await updatePasswordDb(session, resetPwd._id, password)
				if (!update) {
					throw throwInternalError() // "System error while updating the password."
				} // else console.debug('--pwd updated')

				// delete password reset request data from db
				await removeResetReq(session, uEmail)

				// send new password confirmation email
				const SocketLabsObj = new SocketLabsLib()
				await SocketLabsObj.sendResetPwdConfirmation(uEmail, resetPwd.name)
			})
		} catch (e: unknown) {
			tryCatchRethrow(e as GraphQLError | Error)
		} finally {
			await session.endSession()
		}

		return true
	}
}
