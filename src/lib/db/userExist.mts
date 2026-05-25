import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { ClientSession } from 'mongoose'

export async function userExist(uEmail: string, session: ClientSession) {
	const user = await UserBase.findOne({ 'login.email': uEmail }, '_id').session(session).lean()

	return user !== null
}
