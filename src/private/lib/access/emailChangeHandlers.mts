import { IVerifyEmailMailer } from '@lib/access/verifyEmailMailer.mjs'
import { StringLib } from '@lib/StringLib.mjs'
import { throwInternalError } from '@throw/throwInternalError.mjs'
import { Types } from 'mongoose'

import type { IEmailChangeHashVerifyDeps } from '../../../graphQL/schema/mutations/emailChangeHashVerify.mjs'
import { buildProjection, readPath } from './pathTools.mjs'

/**
 * Everything the `emailChangeHashVerify` branch handlers need, bundled so each stays within the max-params
 * budget: the bound deps, the lean document just read with its `_id`, the lowercased email and the resolved
 * mailer. The `deps` type is imported as a type only, so there is no runtime cycle with the mutation.
 */
export interface IVerifyContext {
	deps: IEmailChangeHashVerifyDeps
	user: unknown
	uId: Types.ObjectId
	uEmail: string
	mailer: IVerifyEmailMailer
}

/**
 * Read the pending email-change row addressed by `uEmail` and bundle it into the context the handlers take,
 * or resolve `null` when no account holds that address.
 *
 * Every field the handlers read must be listed in the projection. account.email.requestTimes was missing, and
 * because this is a .lean() read the absent key made handleHashMismatch throw 500 on *every* wrong hash: the
 * strike counter never advanced and the owner never got the wrongHash warning.
 */
export async function loadVerifyContext(
	deps: IEmailChangeHashVerifyDeps,
	mailer: IVerifyEmailMailer,
	uEmail: string
): Promise<IVerifyContext | null> {
	const { paths } = deps

	// Field name comes from the factory `paths` argument the consuming developer supplies at startup, never from request data.
	// nosemgrep: koa-utils.nosql-injection.dynamic-filter-key
	const user: unknown = await deps.model
		.findOne({ [paths.newEmailTmp]: uEmail })
		.select(buildProjection([paths.hash, paths.dateLastReq, paths.requestTimes, paths.deleted, paths.disabled]))
		.lean()

	if (user === null) {
		return null
	}

	return { deps, user, uId: readPath(user, '_id') as Types.ObjectId, uEmail, mailer }
}

/**
 * The submitted hash does not match the stored one: count the attempt and warn the account owner.
 * Moved out of `emailChangeHashVerify.mts` to keep that file inside the FTA score target — behaviour unchanged.
 */
export async function handleHashMismatch(ctx: IVerifyContext) {
	// hash failed
	const requestTimes = readPath(ctx.user, ctx.deps.paths.requestTimes) as number | undefined

	if (typeof requestTimes === 'undefined') {
		throw throwInternalError()
	}

	await ctx.deps.incReqTimes(ctx.uId)
	// noinspection ES6MissingAwait
	void ctx.mailer.wrongHash(ctx.uEmail, requestTimes)
	return false
}

/**
 * The submitted hash matches: enforce the freshness/account guards and, if the target email is still
 * free, accept it. Moved out of `emailChangeHashVerify.mts` to keep that file inside the FTA score target
 * — behaviour unchanged.
 */
export async function handleValidHash(ctx: IVerifyContext) {
	const { deps, user, uId, uEmail, mailer } = ctx
	const { paths } = deps
	const dateLastReq = readPath(user, paths.dateLastReq) as Date | undefined

	if (typeof dateLastReq === 'undefined') {
		// Planned: report 'dateLastReq is undefined' to Sentry before throwing. Not wired up yet.
		throw throwInternalError()
	}

	// if dateLastReq is older than 3 days, warn and stop
	const StrLibObj = new StringLib()
	const now = new Date()
	const day3ago = new Date(now.setDate(now.getDate() - 3))

	if (StrLibObj.isoToTimestamp(day3ago) > StrLibObj.isoToTimestamp(dateLastReq)) {
		// dateLastReq too old then 3 days

		// noinspection ES6MissingAwait
		void mailer.hashReqTooOld(uEmail)
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
		void mailer.accountDisabled(uEmail)
		return false
	}

	// valid request. meanwhile, has some user registered with this email address ??
	// Field name comes from the factory `paths` argument the consuming developer supplies at startup, never from request data.
	// nosemgrep: koa-utils.nosql-injection.dynamic-filter-key
	const qty = await deps.model.countDocuments({ [paths.email]: uEmail })
	if (qty > 0) {
		return false
	}

	// accept new email
	await deps.confirmNewEmail(uId, uEmail)
	return true
}
