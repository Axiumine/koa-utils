import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { DEFAULT_VERIFY_EMAIL_PATHS, IVerifyEmailPaths, TAccessModel } from '@lib/access/accessPaths.mjs'
import { StringLib } from '@lib/StringLib.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import confirmNewEmail, { TConfirmNewEmail } from '@private/lib/access/db/confirmNewEmail.mjs'
import { incReqTimes, TIncReqTimes } from '@private/lib/access/db/incReqTimes.mjs'
import { buildProjection, readPath } from '@private/lib/access/pathTools.mjs'
import { throwInternalError } from '@throw/throwInternalError.mjs'
import { GraphQLBoolean, GraphQLNonNull, GraphQLString } from 'graphql'
import { Types } from 'mongoose'

interface IArgs {
	email: string
	hash: string
}

/** Model, field map and writers the resolver needs, all bound together by the caller. */
export interface IEmailChangeHashVerifyDeps {
	model: TAccessModel
	paths: IVerifyEmailPaths
	confirmNewEmail: TConfirmNewEmail
	incReqTimes: TIncReqTimes
}

/**
 * The submitted hash does not match the stored one: count the attempt and warn the account owner.
 * Extracted from resolve() only to keep it inside the max-lines-per-function budget — behaviour unchanged.
 */
async function handleHashMismatch(
	incReqTimesFn: TIncReqTimes,
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

	await incReqTimesFn(uId)
	// noinspection ES6MissingAwait
	SocketLabsObj.wrongHash(uEmail, requestTimes)
	return false
}

/**
 * Change email - Verify match between email and hash
 *
 * The collection and every field path come from `deps`, so the same resolver serves any account model.
 * The projection is built from the same map the reads use, which is what keeps a read field from going
 * missing — the exact bug that made every wrong hash answer 500 through 5.1.0.
 */
export const createEmailChangeHashVerifyMutation = (deps: IEmailChangeHashVerifyDeps) => ({
	description: 'Change email - Verify match between email and hash',
	type: new GraphQLNonNull(GraphQLBoolean),
	args: {
		email: { type: new GraphQLNonNull(GraphQLString) },
		hash: { type: new GraphQLNonNull(GraphQLString) }
	},
	async resolve(_: unknown, args: IArgs) {
		const { paths } = deps
		const { email, hash } = args
		const uEmail = email.toLowerCase()

		// search if the email exists
		// Every field this resolver reads must be listed. account.email.requestTimes was missing, and
		// because this is a .lean() read the absent key made handleHashMismatch throw 500 on *every*
		// wrong hash: the strike counter never advanced and the owner never got the wrongHash warning.
		const user = await deps.model
			.findOne({ [paths.newEmailTmp]: uEmail })
			.select(buildProjection([paths.hash, paths.dateLastReq, paths.requestTimes, paths.deleted, paths.disabled]))
			.lean()

		// if email not found, return
		if (user === null) {
			// <- not found or wrong, do not say to the user the real problem !
			console.debug('email NOT found ', uEmail)

			return false // @fixme throw
		}
		console.debug('email found')

		const SocketLabsObj = new SocketLabsLib()
		const StrLibObj = new StringLib()

		console.debug('comparing hash ')
		const uId = readPath(user, '_id') as Types.ObjectId
		const dateLastReq = readPath(user, paths.dateLastReq) as Date | undefined
		if (hash === readPath(user, paths.hash)) {
			if (typeof dateLastReq === 'undefined') {
				// @fixme sentry 'dateLastReq is undefined'
				throw throwInternalError()
			}

			console.debug('activation link hash is valid')
			/****************************************************
			 * if dateLastReq too old then 3 days send email
			 */

			const now = new Date()
			const day3ago = new Date(now.setDate(now.getDate() - 3))
			const tsReq = StrLibObj.isoToTimestamp(dateLastReq)
			const ts3DayAgo = StrLibObj.isoToTimestamp(day3ago)

			if (ts3DayAgo > tsReq) {
				// dateLastReq too old then 3 days
				console.debug('but link is too old')

				// noinspection ES6MissingAwait
				SocketLabsObj.hashReqTooOld(uEmail)
				return false
			}

			// account is deleted -> maybe by admin for any reason
			// Read raw: this is a .lean() query, so Mongoose casting never runs and these are real
			// booleans only on data that scripts/migrate-account-disabled-to-boolean.mjs has been
			// through. A legacy string 'false' is truthy and blocks here — migrate, don't coerce.
			else if (readPath(user, paths.deleted)) {
				return false
			}
			// if account is disabled, for any reason
			else if (readPath(user, paths.disabled)) {
				// noinspection ES6MissingAwait
				SocketLabsObj.accountDisabled(uEmail)
				return false
			} else {
				// valid request. is this email free ?

				// meanwhile, has some user registered with this email address ??
				const qty = await deps.model.countDocuments({ [paths.email]: uEmail })

				if (qty === 0) {
					// accept new email
					await deps.confirmNewEmail(uId, uEmail)
					return true
				} else {
					return false
				}
			}
		} else {
			return handleHashMismatch(
				deps.incReqTimes,
				uId,
				uEmail,
				readPath(user, paths.requestTimes) as number | undefined,
				SocketLabsObj
			)
		}
	}
})

/** Shape of the bound mutation, for the modules that take it as a dependency. */
export type TEmailChangeHashVerifyMutation = ReturnType<typeof createEmailChangeHashVerifyMutation>

/** `UserBase`-bound default — the mutation every existing consumer already imports. */
export const emailChangeHashVerify: TEmailChangeHashVerifyMutation = createEmailChangeHashVerifyMutation({
	model: UserBase,
	paths: DEFAULT_VERIFY_EMAIL_PATHS,
	confirmNewEmail,
	incReqTimes
})
