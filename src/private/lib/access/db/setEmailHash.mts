import { DEFAULT_VERIFY_EMAIL_PATHS, IVerifyEmailPaths, TAccessModel } from '@lib/access/accessPaths.mjs'
import { emailHash } from '@lib/emailHash.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { ClientSession, Types } from 'mongoose'

export const createSetEmailHash = (model: TAccessModel, paths: IVerifyEmailPaths) =>
	async function setEmailHash(session: ClientSession, userId: Types.ObjectId) {
		const hash = emailHash()

		//calculate password hash
		const dtNow = new Date()

		await model.updateOne(
			{ _id: userId },
			{
				$set: {
					[paths.hash]: hash,
					[paths.requestTimes]: 1, // ok
					[paths.dateLastReq]: dtNow
				}
			},
			{ session, runValidators: true }
		)

		return hash // else it goes into exception @fixme check
	}

/** Signature of the bound writer, for the modules that take it as a dependency. */
export type TSetEmailHash = ReturnType<typeof createSetEmailHash>

/** `UserBase`-bound default — the behaviour every existing consumer already imports. */
export const setEmailHash: TSetEmailHash = createSetEmailHash(UserBase, DEFAULT_VERIFY_EMAIL_PATHS)
