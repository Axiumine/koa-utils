import { UserBase } from '@models/MongoDB/UserBase.mjs'
import mongoose from 'mongoose'

export default async function confirmNewEmail(
	_id: mongoose.Types.ObjectId,
	email: string
) {
	return await UserBase.updateOne(
		{ _id },
		{
			$set: { 'login.email': email },
			$unset: {
				'account.email.hash': '',
				'account.email.dateLastReq': '',
				'account.email.requestTimes': '',
				'account.email.newEmailTmp': ''
			}
		}
	).exec()
}
