import { UserBase } from '@models/MongoDB/UserBase.mjs'
import mongoose from 'mongoose'

export async function incReqTimes(_id: mongoose.Types.ObjectId) {
	return UserBase.updateOne(
		{ _id },
		{ $inc: { 'account.email.requestTimes': 1 } },
		{ runValidators: true }
	)
}
