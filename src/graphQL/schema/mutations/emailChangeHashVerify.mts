import { DEFAULT_VERIFY_EMAIL_PATHS, IVerifyEmailPaths, TAccessModel } from '@lib/access/accessPaths.mjs'
import { defaultVerifyEmailMailer, IVerifyEmailMailer } from '@lib/access/verifyEmailMailer.mjs'
import { StringLib } from '@lib/StringLib.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import confirmNewEmail, { TConfirmNewEmail } from '@private/lib/access/db/confirmNewEmail.mjs'
import { incReqTimes, TIncReqTimes } from '@private/lib/access/db/incReqTimes.mjs'
import { buildProjection, readPath } from '@private/lib/access/pathTools.mjs'
import { throwInternalError } from '@throw/throwInternalError.mjs'
import { GraphQLBoolean, GraphQLNonNull, GraphQLString } from 'graphql'
import { Types } from 'mongoose'

/** Arguments accepted by the `emailChangeHashVerify` mutation. Exported so a consumer re-exporting the bound mutation can name its type. */
export interface IEmailChangeHashVerifyArgs {
	email: string
	hash: string
}

/** Model, field map and writers the resolver needs, all bound together by the caller. */
export interface IEmailChangeHashVerifyDeps {
	model: TAccessModel
	paths: IVerifyEmailPaths
	confirmNewEmail: TConfirmNewEmail
	incReqTimes: TIncReqTimes
	/**
	 * Who sends the three notifications this resolver can trigger. Optional, defaulting to the debounced
	 * SocketLabs binding — the client used to be constructed in `resolve`, so no caller could exercise a
	 * branch without a real send.
	 */
	mailer?: IVerifyEmailMailer
}

/**
 * Everything the extracted branch handlers need, bundled so each stays within the max-params budget:
 * the bound deps, the lean document just read, the lowercased email and the resolved mailer.
 */
interface IVerifyContext {
	deps: IEmailChangeHashVerifyDeps
	user: unknown
	uEmail: string
	mailer: IVerifyEmailMailer
}

/**
 * The submitted hash does not match the stored one: count the attempt and warn the account owner.
 * Extracted from resolve() only to keep it inside the max-lines-per-function budget — behaviour unchanged.
 */
async function handleHashMismatch(ctx: IVerifyContext, uId: Types.ObjectId, requestTimes: number | undefined) {
	// hash failed

	if (typeof requestTimes === 'undefined') {
		throw throwInternalError()
	}

	await ctx.deps.incReqTimes(uId)
	// noinspection ES6MissingAwait
	ctx.mailer.wrongHash(ctx.uEmail, requestTimes)
	return false
}

/**
 * The submitted hash matches: enforce the freshness/account guards and, if the target email is still
 * free, accept it. Extracted from resolve() only to keep it inside the max-lines-per-function budget.
 */
async function handleValidHash(ctx: IVerifyContext, uId: Types.ObjectId, dateLastReq: Date | undefined) {
	const { deps, user, uEmail, mailer } = ctx
	const { paths } = deps

	if (typeof dateLastReq === 'undefined') {
		// @fixme sentry 'dateLastReq is undefined'
		throw throwInternalError()
	}

	// if dateLastReq is older than 3 days, warn and stop
	const StrLibObj = new StringLib()
	const now = new Date()
	const day3ago = new Date(now.setDate(now.getDate() - 3))

	if (StrLibObj.isoToTimestamp(day3ago) > StrLibObj.isoToTimestamp(dateLastReq)) {
		// dateLastReq too old then 3 days

		// noinspection ES6MissingAwait
		mailer.hashReqTooOld(uEmail)
		return false
	}

	// account is deleted -> maybe by admin for any reason
	// Read raw: this is a .lean() query, so Mongoose casting never runs and these are real booleans
	// only on data that scripts/migrate-account-disabled-to-boolean.mjs has been through. A legacy
	// string 'false' is truthy and blocks here — migrate, don't coerce.
	if (readPath(user, paths.deleted)) {
		return false
	}
	// if account is disabled, for any reason
	if (readPath(user, paths.disabled)) {
		// noinspection ES6MissingAwait
		mailer.accountDisabled(uEmail)
		return false
	}

	// valid request. meanwhile, has some user registered with this email address ??
	const qty = await deps.model.countDocuments({ [paths.email]: uEmail })
	if (qty > 0) {
		return false
	}

	// accept new email
	await deps.confirmNewEmail(uId, uEmail)
	return true
}

/**
 * Change email - Verify match between email and hash
 *
 * The collection and every field path come from `deps`, so the same resolver serves any account model.
 * The projection is built from the same map the reads use, which is what keeps a read field from going
 * missing — the exact bug that made every wrong hash answer 500 through 5.1.0.
 */
export const createEmailChangeHashVerifyMutation = (deps: IEmailChangeHashVerifyDeps) => {
	const mailer = deps.mailer ?? defaultVerifyEmailMailer

	return {
		description: 'Change email - Verify match between email and hash',
		type: new GraphQLNonNull(GraphQLBoolean),
		args: {
			email: { type: new GraphQLNonNull(GraphQLString) },
			hash: { type: new GraphQLNonNull(GraphQLString) }
		},
		async resolve(_: unknown, args: IEmailChangeHashVerifyArgs) {
			const { paths } = deps
			const uEmail = args.email.toLowerCase()

			// search if the email exists
			// Every field this resolver reads must be listed. account.email.requestTimes was missing, and
			// because this is a .lean() read the absent key made handleHashMismatch throw 500 on *every*
			// wrong hash: the strike counter never advanced and the owner never got the wrongHash warning.
			const user = await deps.model
				.findOne({ [paths.newEmailTmp]: uEmail })
				.select(buildProjection([paths.hash, paths.dateLastReq, paths.requestTimes, paths.deleted, paths.disabled]))
				.lean()

			// if email not found, return (do not tell the user the real problem !)
			if (user === null) {
				return false // @fixme throw
			}

			const ctx: IVerifyContext = { deps, user, uEmail, mailer }

			const uId = readPath(user, '_id') as Types.ObjectId
			const dateLastReq = readPath(user, paths.dateLastReq) as Date | undefined

			if (args.hash === readPath(user, paths.hash)) {
				return handleValidHash(ctx, uId, dateLastReq)
			}
			return handleHashMismatch(ctx, uId, readPath(user, paths.requestTimes) as number | undefined)
		}
	}
}

/** Shape of the bound mutation, for the modules that take it as a dependency. */
export type TEmailChangeHashVerifyMutation = ReturnType<typeof createEmailChangeHashVerifyMutation>

/** `UserBase`-bound default — the mutation every existing consumer already imports. */
export const emailChangeHashVerify: TEmailChangeHashVerifyMutation = createEmailChangeHashVerifyMutation({
	model: UserBase,
	paths: DEFAULT_VERIFY_EMAIL_PATHS,
	confirmNewEmail,
	incReqTimes
})
