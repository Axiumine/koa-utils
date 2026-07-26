import { DEFAULT_VERIFY_EMAIL_PATHS, IVerifyEmailPaths, TAccessModel } from '@lib/access/accessPaths.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import * as Sentry from '@sentry/node'

/**
 * Hard delete of an abandoned pending registration, keyed by the login-email path.
 *
 * Reached through `createAbandonUser`, which is what decides whether abandonment means this, a tombstone
 * flag or nothing at all — the package cannot know what deleting a row costs in a model it was handed.
 * See `TOnAbandon`.
 */
export const createDeleteUserByEmail = (model: TAccessModel, paths: IVerifyEmailPaths) =>
	async function deleteUserByEmail(email: string) {
		const ret = await model.deleteOne({ [paths.email]: email })

		if (ret.deletedCount === 0) {
			// The caller read this account moments ago and its guards decided the registration was abandoned, so
			// nothing matching means the address moved, the path map is wrong, or another writer got there first.
			// Reporting nothing is what left a delete that matched nothing indistinguishable from one that worked.
			Sentry.captureMessage(`[deleteUserByEmail] no document matched ${paths.email} = ${email}`, 'warning')
		}
	}

/** Signature of the bound writer, for the modules that take it as a dependency. */
export type TDeleteUserByEmail = ReturnType<typeof createDeleteUserByEmail>

/** `UserBase`-bound default — the behaviour every existing consumer already imports. */
export default createDeleteUserByEmail(UserBase, DEFAULT_VERIFY_EMAIL_PATHS)
