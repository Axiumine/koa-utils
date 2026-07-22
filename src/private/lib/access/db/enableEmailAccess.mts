import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { DEFAULT_VERIFY_EMAIL_PATHS, IVerifyEmailPaths, TAccessModel } from '@lib/access/accessPaths.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { buildUnset } from '@private/lib/access/pathTools.mjs'
import mongoose from 'mongoose'

export const createEnableEmailAccess = (model: TAccessModel, paths: IVerifyEmailPaths) =>
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

		const SocketLabsObj = new SocketLabsLib()
		await SocketLabsObj.sendWelcome(email)
	}

/** Signature of the bound writer, for the modules that take it as a dependency. */
export type TEnableEmailAccess = ReturnType<typeof createEnableEmailAccess>

/** `UserBase`-bound default — the behaviour every existing consumer already imports. */
export const enableEmailAccess: TEnableEmailAccess = createEnableEmailAccess(UserBase, DEFAULT_VERIFY_EMAIL_PATHS)
