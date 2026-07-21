import { emailHash } from '@lib/emailHash.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { ClientSession, Types } from 'mongoose'

export async function setEmailHash(session: ClientSession, userId: Types.ObjectId) {
	const hash = emailHash()

	//calculate password hash
	const dtNow = new Date()

	await UserBase.updateOne(
		{ _id: userId },
		{
			$set: {
				'account.email.hash': hash,
				'account.email.requestTimes': 1, // ok
				'account.email.dateLastReq': dtNow
			}
		},
		{ session, runValidators: true }
	)

	return hash // else it goes into exception @fixme check
}
