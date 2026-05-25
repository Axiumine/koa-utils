import UserAdminKoaUtils from '@private/graphQL/models/MongoDB/private/UserAdminKoaUtils.mjs'
import { ClientSession, Types } from 'mongoose'

import { _buildLoginStatsUpdate } from './_buildLoginStatsUpdate.mjs'

export async function updateAdminLoginStats(
	id: Types.ObjectId,
	lastLogin: null | Date,
	rememberMe: boolean,
	session: ClientSession
) {
	const { dbSet, dbUnset } = _buildLoginStatsUpdate(lastLogin, rememberMe)

	await UserAdminKoaUtils.updateOne({ _id: id }, { $set: dbSet, $unset: dbUnset }, { session, runValidators: true })
}
