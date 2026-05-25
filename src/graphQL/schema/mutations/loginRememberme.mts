import { IContextLogin } from '@context/IContextLogin.mjs'
import { checkEmailLen } from '@lib/checkEmailLen.mjs'
import { checkPwdLen } from '@lib/checkPwdLen.mjs'
import { setLoginCookies } from '@lib/setLoginCookies.mjs'
import { accessTokenExpiry, generateAccessToken, generateRefreshToken } from '@lib/tokens.mjs'
import { tryCatchRethrow } from '@lib/tryCatchRethrow.mjs'
import { checkUserLoginAuthorization } from '@private/graphQL/schema/mutations/checkUserLoginAuthorization.mjs'
import { setRedisLoginSession } from '@private/graphQL/schema/mutations/setRedisLoginSession.mjs'
import { updateLoginStatsRememberme } from '@private/graphQL/schema/mutations/updateLoginStatsRememberme.mjs'
import * as Sentry from '@sentry/node'
import { LoginType } from '@stypes/LoginType.mjs'
import { GraphQLBoolean, GraphQLError, GraphQLNonNull, GraphQLString } from 'graphql'
import mongoose from 'mongoose'

interface IArgs {
	email: string
	password: string
	rememberMe: boolean
}

export const loginRememberme = {
	description: 'login in platform with remember me flag',
	type: new GraphQLNonNull(LoginType),
	args: {
		email: { type: new GraphQLNonNull(GraphQLString) },
		password: { type: new GraphQLNonNull(GraphQLString) },
		rememberMe: { type: new GraphQLNonNull(GraphQLBoolean) }
	},
	async resolve(_: unknown, args: IArgs, ctx: IContextLogin) {
		const { email, password, rememberMe } = args

		const uEmail = email.toLowerCase().trim()
		checkEmailLen(uEmail)
		checkPwdLen(password)

		let accessToken = ''

		const session = await mongoose.startSession()
		try {
			await session.withTransaction(async () => {
				// search if the email exists
				const user = await checkUserLoginAuthorization(uEmail, password, session)
				// pwd valid
				const uId = user.userId
				await updateLoginStatsRememberme(uId, user.lastLogin, rememberMe, session)
				// console.debug('[login] lastlogin ok')

				accessToken = generateAccessToken()
				const refreshToken = generateRefreshToken()
				const accTokenExp = accessTokenExpiry()

				await setRedisLoginSession(uId, accessToken, accTokenExp, refreshToken)
				setLoginCookies(ctx, refreshToken)
			})
		} catch (e: unknown) {
			accessToken = ''
			Sentry.captureException(e)
			tryCatchRethrow(e as GraphQLError | Error)
		} finally {
			await session.endSession()
		}

		return { accessToken }
	}
}
