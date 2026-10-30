import { DEFAULT_VERIFY_EMAIL_PATHS, IVerifyEmailPaths, TAccessModel } from '@lib/access/accessPaths.mjs'
import { defaultVerifyEmailMailer, IVerifyEmailMailer } from '@lib/access/verifyEmailMailer.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import confirmNewEmail, { TConfirmNewEmail } from '@private/lib/access/db/confirmNewEmail.mjs'
import { incReqTimes, TIncReqTimes } from '@private/lib/access/db/incReqTimes.mjs'
import { handleHashMismatch, handleValidHash, loadVerifyContext } from '@private/lib/access/emailChangeHandlers.mjs'
import { readPath } from '@private/lib/access/pathTools.mjs'
import { GraphQLBoolean, GraphQLNonNull, GraphQLString } from 'graphql'

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
			// search if the email exists
			const ctx = await loadVerifyContext(deps, mailer, args.email.toLowerCase())

			// if email not found, return (do not tell the user the real problem !)
			if (ctx === null) {
				return false // @fixme throw
			}

			if (args.hash === readPath(ctx.user, deps.paths.hash)) {
				return handleValidHash(ctx)
			}
			return handleHashMismatch(ctx)
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
