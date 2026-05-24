import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { checkEmailLen } from '@lib/checkEmailLen.mjs'
import { checkPwdLen } from '@lib/checkPwdLen.mjs'
import { registerNewUser } from '@lib/db/registerNewUser.mjs'
import { userExist } from '@lib/db/userExist.mjs'
import { tryCatchRethrow } from '@lib/tryCatchRethrow.mjs'
import { throwConflictError } from '@throw/throwConflictError.mjs'
import { GraphQLBoolean, GraphQLError, GraphQLNonNull, GraphQLString } from 'graphql'
import mongoose from 'mongoose'

interface IArgs {
	email: string;
	password: string;
}

export const signUp = {
	description: 'Sign Up',
	type: new GraphQLNonNull(GraphQLBoolean),
	args: {
		email: { type: new GraphQLNonNull(GraphQLString) },
		password: { type: new GraphQLNonNull(GraphQLString) }
	},
	async resolve(_: unknown, args: IArgs) {
		const { email, password } = args

		const uEmail = email.toLowerCase().trim()
		checkEmailLen(uEmail)
		checkPwdLen(password)

		const session = await mongoose.startSession()
		let uExist = false
		try {
			await session.withTransaction(async () => {
				/********************************************
				 * First, search if the user does not exist
				 */
				uExist = await userExist(uEmail, session)
				if (uExist) {
					const SocketLabsObj = new SocketLabsLib()
					await SocketLabsObj.emailAlreadyValid(uEmail)
					throw throwConflictError()
				}

				/*********************************************
				 * ok, new user. create user obj for DB. generate hash password
				 */
				const hashConfirmEmail = await registerNewUser(
					uEmail,
					password,
					session
				)

				/************************************
				 * send email
				 */
				const SocketLabsObj = new SocketLabsLib()
				await SocketLabsObj.sendEmailVerify(uEmail, hashConfirmEmail)
			})
		} catch (e: unknown) {
			tryCatchRethrow(e as GraphQLError | Error)
		} finally {
			await session.endSession()
		}

		return true
	}
}
