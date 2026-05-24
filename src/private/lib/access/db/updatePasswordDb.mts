import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { hash } from '@node-rs/bcrypt'
import { SALT_ROUNDS } from '@private/lib/access/Constants.mjs'
import mongoose, { ClientSession } from 'mongoose'

export default async function updatePassword(
	session: ClientSession,
	_id: mongoose.Types.ObjectId,
	password: string
) {
	const hashVal = await hash(password, SALT_ROUNDS)

	return UserBase.updateOne(
		{ _id },
		{ $set: { 'login.password': hashVal } },
		{ session, runValidators: true }
	)
}
