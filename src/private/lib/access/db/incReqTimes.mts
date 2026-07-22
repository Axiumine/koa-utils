import { DEFAULT_VERIFY_EMAIL_PATHS, IVerifyEmailPaths, TAccessModel } from '@lib/access/accessPaths.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import mongoose from 'mongoose'

export const createIncReqTimes = (model: TAccessModel, paths: IVerifyEmailPaths) =>
	async function incReqTimes(_id: mongoose.Types.ObjectId) {
		return model.updateOne({ _id }, { $inc: { [paths.requestTimes]: 1 } }, { runValidators: true })
	}

/** Signature of the bound writer, for the modules that take it as a dependency. */
export type TIncReqTimes = ReturnType<typeof createIncReqTimes>

/** `UserBase`-bound default — the behaviour every existing consumer already imports. */
export const incReqTimes: TIncReqTimes = createIncReqTimes(UserBase, DEFAULT_VERIFY_EMAIL_PATHS)
