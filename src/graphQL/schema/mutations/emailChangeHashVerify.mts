import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { StringLib } from '@lib/StringLib.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import confirmNewEmail from '@private/lib/access/db/confirmNewEmail.mjs'
import { incReqTimes } from '@private/lib/access/db/incReqTimes.mjs'
import { throwInternalError } from '@throw/throwInternalError.mjs'
import { GraphQLBoolean, GraphQLNonNull, GraphQLString } from 'graphql'
import { Types } from 'mongoose'

interface IArgs {
	email: string
	hash: string
}

/**
 * The submitted hash does not match the stored one: count the attempt and warn the account owner.
 * Extracted from resolve() only to keep it inside the max-lines-per-function budget — behaviour unchanged.
 */
async function handleHashMismatch(
	uId: Types.ObjectId,
	uEmail: string,
	requestTimes: number | undefined,
	SocketLabsObj: SocketLabsLib
) {
	// hash failed
	console.debug('HASH FAILED')

	if (typeof requestTimes === 'undefined') {
		throw throwInternalError()
	}

	await incReqTimes(uId)
	// noinspection ES6MissingAwait
	SocketLabsObj.wrongHash(uEmail, requestTimes)
	return false
}

/**
 * Change email - Verify match between email and hash
 */
export const emailChangeHashVerify = {
	description: 'Change email - Verify match between email and hash',
	type: new GraphQLNonNull(GraphQLBoolean),
	args: {
		email: { type: new GraphQLNonNull(GraphQLString) },
		hash: { type: new GraphQLNonNull(GraphQLString) }
	},
	async resolve(_: unknown, args: IArgs) {
		const { email, hash } = args
		const uEmail = email.toLowerCase()

		// search if the email exists
		const user = await UserBase.findOne({ 'account.email.newEmailTmp': uEmail })
			.select('_id account.email.hash account.email.dateLastReq account.deleted account.disabled')
			.lean()

		// if email not found, return
		if (user === null) {
			// <- not found or wrong, do not say to the user the real problem !
			console.debug('email NON trovata ', uEmail)

			return false // @fixme throw
		}
		console.debug('email trovata')

		const SocketLabsObj = new SocketLabsLib()
		const StrLibObj = new StringLib()

		console.debug('comparo hash ')
		const accountEmail = user.account.email
		if (hash === accountEmail.hash) {
			if (typeof accountEmail.dateLastReq === 'undefined') {
				// @fixme sentry 'dateLastReq is undefined'
				throw throwInternalError()
			}

			console.debug('hash link di attivazione è valido')
			/****************************************************
			 * if dateLastReq too old then 3 days send email
			 */

			const now = new Date()
			const day3ago = new Date(now.setDate(now.getDate() - 3))
			const tsReq = StrLibObj.isoToTimestamp(accountEmail.dateLastReq)
			const ts3DayAgo = StrLibObj.isoToTimestamp(day3ago)

			if (ts3DayAgo > tsReq) {
				// dateLastReq too old then 3 days
				console.debug('but link is too old')

				// noinspection ES6MissingAwait
				SocketLabsObj.hashReqTooOld(uEmail)
				return false
			}

			// account is deleted -> maybe by admin for any reason
			else if (user.account.deleted) {
				return false
			}
			// if account is disabled, for any reason
			else if (user.account.disabled) {
				// noinspection ES6MissingAwait
				SocketLabsObj.accountDisabled(uEmail)
				return false
			} else {
				// valid request. is this email free ?

				// meanwhile, has some user registered with this email address ??
				const qty = await UserBase.countDocuments({ 'login.email': uEmail })

				if (qty === 0) {
					// accept new email
					await confirmNewEmail(user._id, uEmail)
					return true
				} else {
					return false
				}
			}
		} else {
			return handleHashMismatch(user._id, uEmail, accountEmail.requestTimes, SocketLabsObj)
		}
	}
}
