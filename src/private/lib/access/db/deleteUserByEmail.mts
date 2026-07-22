// @todo report on Sentry
import { DEFAULT_VERIFY_EMAIL_PATHS, IVerifyEmailPaths, TAccessModel } from '@lib/access/accessPaths.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'

export const createDeleteUserByEmail = (model: TAccessModel, paths: IVerifyEmailPaths) =>
	async function deleteUserByEmail(email: string) {
		await model.deleteOne({ [paths.email]: email })

		/* if (ret.deletedCount === 0) {
	  } */
	}

/** Signature of the bound writer, for the modules that take it as a dependency. */
export type TDeleteUserByEmail = ReturnType<typeof createDeleteUserByEmail>

/** `UserBase`-bound default — the behaviour every existing consumer already imports. */
export default createDeleteUserByEmail(UserBase, DEFAULT_VERIFY_EMAIL_PATHS)
