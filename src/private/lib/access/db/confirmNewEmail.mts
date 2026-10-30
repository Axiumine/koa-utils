import { DEFAULT_VERIFY_EMAIL_PATHS, IVerifyEmailPaths, TAccessModel } from '@lib/access/accessPaths.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { buildUnset } from '@private/lib/access/pathTools.mjs'
import mongoose from 'mongoose'

export const createConfirmNewEmail = (model: TAccessModel, paths: IVerifyEmailPaths) =>
	async function confirmNewEmail(_id: mongoose.Types.ObjectId, email: string) {
		// Field names come from the `paths` map fixed when the flow is built, never from request data; only the values do.
		// nosemgrep: koa-utils.nosql-injection.mass-assignment-update-doc
		return await model
			.updateOne(
				{ _id },
				{
					$set: { [paths.email]: email },
					$unset: buildUnset(paths.emailChangeClear)
				}
			)
			.exec()
	}

/** Signature of the bound writer, for the modules that take it as a dependency. */
export type TConfirmNewEmail = ReturnType<typeof createConfirmNewEmail>

/** `UserBase`-bound default — the behaviour every existing consumer already imports. */
export default createConfirmNewEmail(UserBase, DEFAULT_VERIFY_EMAIL_PATHS)
