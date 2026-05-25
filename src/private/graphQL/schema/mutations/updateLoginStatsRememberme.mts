import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { ClientSession, Types } from 'mongoose'

import { _buildLoginStatsUpdate } from './_buildLoginStatsUpdate.mjs'

export async function updateLoginStatsRememberme(
	id: Types.ObjectId,
	lastLogin: null | Date,
	rememberMe: boolean,
	session: ClientSession
) {
	const { dbSet, dbUnset } = _buildLoginStatsUpdate(lastLogin, rememberMe)

	await UserBase.updateOne({ _id: id }, { $set: dbSet, $unset: dbUnset }, { session, runValidators: true })
}
