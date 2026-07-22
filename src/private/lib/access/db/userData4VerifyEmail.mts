import { DEFAULT_VERIFY_EMAIL_PATHS, IVerifyEmailPaths, TAccessModel } from '@lib/access/accessPaths.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { EMAIL_CHECK_LINK } from '@private/lib/access/Constants.mjs'
import { buildProjection } from '@private/lib/access/pathTools.mjs'
import * as Sentry from '@sentry/node'

export const createUserData4VerifyEmail = (model: TAccessModel, paths: IVerifyEmailPaths) =>
	async function userData4VerifyEmail(uEmail: string) {
		// Every field the guard chain reads must be listed. This is a .lean() read, so a field left out
		// of the projection is simply absent on the returned object, with no error — which is how a
		// missing requestTimes turned every wrong-hash attempt into a 500 under a green coverage gate.
		const user = await model
			.findOne({ [paths.email]: uEmail })
			.select(buildProjection([paths.hash, paths.valid, paths.dateLastReq, paths.requestTimes, paths.deleted, paths.disabled]))
			.lean()

		// if email not found, return stNotFoundNotMatch
		if (user === null) {
			Sentry.captureMessage(`User ${uEmail} not exist`)

			throw new Error(EMAIL_CHECK_LINK)
		}
		return user
	}

/** Signature of the bound reader, for the modules that take it as a dependency. */
export type TUserData4VerifyEmail = ReturnType<typeof createUserData4VerifyEmail>

/** `UserBase`-bound default — the behaviour every existing consumer already imports. */
export const userData4VerifyEmail: TUserData4VerifyEmail = createUserData4VerifyEmail(UserBase, DEFAULT_VERIFY_EMAIL_PATHS)
