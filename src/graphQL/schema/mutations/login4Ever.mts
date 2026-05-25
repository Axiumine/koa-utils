import { IContextLogin } from '@context/IContextLogin.mjs'
import { checkEmailLen } from '@lib/checkEmailLen.mjs'
import { checkPwdLen } from '@lib/checkPwdLen.mjs'
import { setLoginCookies } from '@lib/setLoginCookies.mjs'
import { accessTokenExpiry, generateAccessToken, generateRefreshToken } from '@lib/tokens.mjs'
import { tryCatchRethrow } from '@lib/tryCatchRethrow.mjs'
import { checkUserLoginAuthorization } from '@private/graphQL/schema/mutations/checkUserLoginAuthorization.mjs'
import { setRedisLoginSession } from '@private/graphQL/schema/mutations/setRedisLoginSession.mjs'
import { updateLoginStats4ever } from '@private/graphQL/schema/mutations/updateLoginStats4ever.mjs'
import * as Sentry from '@sentry/node'
import { LoginType } from '@stypes/LoginType.mjs'
import { GraphQLError, GraphQLNonNull, GraphQLString } from 'graphql'
import mongoose from 'mongoose'

interface IArgs {
	email: string
	password: string
}

export const login4Ever = {
	description: 'login in platform WITHOUT remember me flag',
	type: new GraphQLNonNull(LoginType),
	args: {
		email: { type: new GraphQLNonNull(GraphQLString) },
		password: { type: new GraphQLNonNull(GraphQLString) }
	},
	async resolve(_: unknown, args: IArgs, ctx: IContextLogin) {
		const { email, password } = args

		//console.debug('[login4Ever]')

		const uEmail = email.toLowerCase().trim()
		checkEmailLen(uEmail)
		checkPwdLen(password)
		//console.debug('[login4Ever] data ok')

		let accessToken = ''

		const session = await mongoose.startSession()
		try {
			await session.withTransaction(async () => {
				// search if the email exists
				const user = await checkUserLoginAuthorization(uEmail, password, session)
				//console.debug('[login4Ever] auth ok')

				// pwd valid
				const uId = user.userId
				await updateLoginStats4ever(uId, user.lastLogin, session)
				//console.debug('[login4Ever] update ok')
				// console.debug('[login] lastlogin ok')

				accessToken = generateAccessToken()
				const refreshToken = generateRefreshToken()
				const accTokenExp = accessTokenExpiry()

				await setRedisLoginSession(uId, accessToken, accTokenExp, refreshToken)
				//console.debug('[login4Ever] redis ok')
				setLoginCookies(ctx, refreshToken)
				//console.debug('[login4Ever] login cookie ok')
			})
		} catch (e: unknown) {
			accessToken = ''
			Sentry.captureException(e)
			tryCatchRethrow(e as GraphQLError | Error)
		} finally {
			await session.endSession()
		}
		//console.debug('[login4Ever] return accessToken', accessToken)
		return { accessToken }
	}
}
