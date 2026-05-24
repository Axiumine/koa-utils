import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { ClientSession } from 'mongoose'

export default async function removeResetReq(
	session: ClientSession,
	email: string
) {
	return UserBase.updateOne(
		{ 'login.email': email },
		{ $unset: { 'account.resetDateReq': '', 'account.resetHash': '' } },
		{ upsert: true }
	)
		.session(session)
		.exec()
}
