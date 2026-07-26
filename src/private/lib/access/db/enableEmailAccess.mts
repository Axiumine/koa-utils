import { DEFAULT_VERIFY_EMAIL_PATHS, IVerifyEmailPaths, TAccessModel } from '@lib/access/accessPaths.mjs'
import { defaultVerifyEmailMailer, IVerifyEmailMailer } from '@lib/access/verifyEmailMailer.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { buildUnset } from '@private/lib/access/pathTools.mjs'
import mongoose from 'mongoose'

/**
 * Mark the address verified, clear the pending-verification fields, welcome the user.
 *
 * The welcome mail goes through an injected mailer so the success path is drivable from an integration suite
 * without a real send. It is never debounced: it fires once per account, on the one path that already required
 * a valid hash. See `throttleMailer`.
 */
export const createEnableEmailAccess = (model: TAccessModel, paths: IVerifyEmailPaths, mailer: IVerifyEmailMailer) =>
	async function enableEmailAccess(_id: mongoose.Types.ObjectId, email: string) {
		await model.updateOne(
			{ _id },
			{
				$set: { [paths.valid]: true },
				$unset: buildUnset(paths.verifyClear)
			},
			{
				runValidators: true
			}
		)

		await mailer.sendWelcome(email)
	}

/** Signature of the bound writer, for the modules that take it as a dependency. */
export type TEnableEmailAccess = ReturnType<typeof createEnableEmailAccess>

/** `UserBase`-bound default — the behaviour every existing consumer already imports. */
export const enableEmailAccess: TEnableEmailAccess = createEnableEmailAccess(
	UserBase,
	DEFAULT_VERIFY_EMAIL_PATHS,
	defaultVerifyEmailMailer
)
