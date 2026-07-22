import { DEFAULT_RESET_PWD_PATHS, IResetPwdPaths, TAccessModel } from '@lib/access/accessPaths.mjs'
import { IMongoDBError } from '@lib/MongoDB/IMongoDBError.mjs'
import { throwMongoDBErrors } from '@lib/MongoDB/throwMongoErrors.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { ClientSession, Types } from 'mongoose'

export const createSaveResetReq = (model: TAccessModel, paths: IResetPwdPaths) =>
	async function saveResetReq(session: ClientSession, _id: Types.ObjectId, now: Date, hash: string) {
		// console.debug('imposto reset in coll Utenti')
		try {
			await model.updateOne(
				{ _id },
				{
					$set: {
						[paths.resetDateReq]: now,
						// the reset slot, never the email-verification one: writing the verification slot
						// here invalidated any pending activation or email-change link, and left a live
						// reset token in the field those flows compare against.
						[paths.resetHash]: hash
					}
				},
				{ session, runValidators: true }
			)
		} catch (e) {
			throw throwMongoDBErrors(e as IMongoDBError)
		}
	}

/** Signature of the bound writer, for the modules that take it as a dependency. */
export type TSaveResetReq = ReturnType<typeof createSaveResetReq>

/** `UserBase`-bound default — the behaviour every existing consumer already imports. */
export const saveResetReq: TSaveResetReq = createSaveResetReq(UserBase, DEFAULT_RESET_PWD_PATHS)
