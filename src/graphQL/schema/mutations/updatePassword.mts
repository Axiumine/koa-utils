import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { checkEmailLen } from '@lib/checkEmailLen.mjs'
import { checkPwdLen } from '@lib/checkPwdLen.mjs'
import { DateLib } from '@lib/DateLib.mjs'
import { tryCatchRethrow } from '@lib/tryCatchRethrow.mjs'
import { getResetPwd, TGetResetPwd } from '@private/lib/access/db/getResetPwd.mjs'
import removeResetReq, { TRemoveResetReq } from '@private/lib/access/db/removeResetReq.mjs'
import updatePasswordDb, { TUpdatePasswordDb } from '@private/lib/access/db/updatePasswordDb.mjs'
import * as Sentry from '@sentry/node'
import { throwForbiddenError } from '@throw/throwForbiddenError.mjs'
import { throwInternalError } from '@throw/throwInternalError.mjs'
import { GraphQLBoolean, GraphQLError, GraphQLNonNull, GraphQLString } from 'graphql'
import mongoose from 'mongoose'

interface IArgs {
	email: string
	hash: string
	password: string
}

/** Readers and writers the resolver needs, all bound to the same model + paths by the caller. */
export interface IUpdatePasswordDeps {
	getResetPwd: TGetResetPwd
	updatePasswordDb: TUpdatePasswordDb
	removeResetReq: TRemoveResetReq
}

/**
 * Change the password of an account holding a valid, unexpired reset hash.
 *
 * The collection and field layout live entirely in the injected reader/writers, so the same resolver
 * serves any account model. In particular the cleanup unsets whatever `resetClear` names, which is not
 * necessarily the two leaf paths this resolver reads — see `removeResetReq`.
 */
export const createUpdatePasswordMutation = (deps: IUpdatePasswordDeps) => ({
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

		// Set only once the transaction has actually persisted the new password. Carries the user's
		// name to the post-commit confirmation email.
		let confirmTo: string | null = null

		const session = await mongoose.startSession()

		try {
			await session.withTransaction(async () => {
				const resetPwd = await deps.getResetPwd(session, uEmail)

				// check if email is present in db
				if (resetPwd === null) {
					throw throwForbiddenError() // don't reveal whether the email is present, for privacy
				}
				// console.debug('--email present')

				// No usable reset state. This is NOT an internal error as far as the caller is concerned:
				// answering 500 here while an unknown address answers 403 turns this mutation into an
				// account-enumeration oracle, because every registered account that has never requested a
				// reset lands on this branch (getResetPwd yields resetHash === null whenever
				// account.resetDateReq is undefined). Same 403 as the unknown-address path; the orphan
				// state is reported to Sentry instead of to the caller.
				if (resetPwd.resetHash === null) {
					Sentry.captureMessage(`[updatePassword] no usable resetHash for ${uEmail}`)
					throw throwForbiddenError()
				}
				/* c8 ignore next 4 -- defensive guard, resetDateReq cannot be null when resetHash is set */
				if (resetPwd.resetDateReq === null) {
					Sentry.captureMessage(`[updatePassword] resetHash set but resetDateReq missing for ${uEmail}`)
					throw throwForbiddenError()
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

				const update = await deps.updatePasswordDb(session, resetPwd._id, password)
				if (!update) {
					throw throwInternalError() // "System error while updating the password."
				} // else console.debug('--pwd updated')

				// delete password reset request data from db
				await deps.removeResetReq(session, uEmail)

				// the confirmation email is sent after the commit, not here
				confirmTo = resetPwd.name
			})
		} catch (e: unknown) {
			tryCatchRethrow(e as GraphQLError | Error)
		} finally {
			await session.endSession()
		}

		// Reached only on a committed transaction: tryCatchRethrow above always throws.
		//
		// The send sits here rather than inside the callback because session.withTransaction re-runs
		// its callback on a transient error, and a retried commit therefore mailed the user a second
		// "your password was changed" notice. It is still awaited — unlike resetPwd there is no timing
		// oracle to close here, since reaching this point at all requires a valid reset hash.
		//
		// A delivery failure no longer fails the request. It used to abort the transaction and answer
		// 500, rolling back the password change with it — consistent, but it made the mail provider a
		// hard dependency: with SocketLabs down, nobody could complete a reset at all. The password is
		// committed by the time we get here, so the failure goes to Sentry and the caller still gets
		// true. The confirmation is a notice, not part of the operation.
		//
		// Don't "restore" the abort: there is no transaction left to abort at this point. Rethrowing
		// would report 500 for a password that is already live, and compensating would mean writing
		// back the old bcrypt hash, which this flow never reads. Moving the send back inside the
		// callback brings back the duplicate notice AND lets a mail go out for a commit that then
		// fails — an email cannot be recalled.
		const name = confirmTo as string | null
		if (name !== null) {
			try {
				const SocketLabsObj = new SocketLabsLib()
				await SocketLabsObj.sendResetPwdConfirmation(uEmail, name)
			} catch (e: unknown) {
				Sentry.captureException(e)
			}
		}

		return true
	}
})

/** Shape of the bound mutation, for the modules that take it as a dependency. */
export type TUpdatePasswordMutation = ReturnType<typeof createUpdatePasswordMutation>

/** `UserBase`-bound default — the mutation every existing consumer already imports. */
export const updatePassword: TUpdatePasswordMutation = createUpdatePasswordMutation({
	getResetPwd,
	updatePasswordDb,
	removeResetReq
})
