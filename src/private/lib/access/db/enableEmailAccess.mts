import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import mongoose from 'mongoose'

export async function enableEmailAccess(_id: mongoose.Types.ObjectId, email: string) {
	await UserBase.updateOne(
		{ _id },
		{
			$set: { 'account.email.valid': true },
			$unset: {
				'account.email.hash': '',
				'account.email.dateLastReq': '',
				'account.email.requestTimes': ''
			}
		},
		{
			runValidators: true
		}
	)

	const SocketLabsObj = new SocketLabsLib()
	await SocketLabsObj.sendWelcome(email)
}
