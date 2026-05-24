import { IMongoDBError } from '@lib/MongoDB/IMongoDBError.mjs'
import { throwMongoDBErrors } from '@lib/MongoDB/throwMongoErrors.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { ClientSession, Types } from 'mongoose'

export const saveResetReq = async function(
	session: ClientSession,
	_id: Types.ObjectId,
	now: Date,
	hash: string
) {
	// console.debug('imposto reset in coll Utenti')
	try {
		await UserBase.updateOne(
			{ _id },
			{
				$set: {
					'account.resetDateReq': now,
					'account.email.hash': hash
				}
			},
			{ session, runValidators: true }
		)
	} catch (e) {
		throw throwMongoDBErrors(e as IMongoDBError)
	}
}
