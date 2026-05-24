import { emailHash } from '@lib/emailHash.mjs'
import { encryptPassword } from '@lib/encryptPassword.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { ClientSession, Types } from 'mongoose'

export async function registerNewUser(
	uEmail: string,
	password: string,
	session: ClientSession
) {
	// console.debug('new user')
	const userId = new Types.ObjectId()
	const nowDt = new Date()
	const hashConfirmEmail = emailHash()
	const pwd = await encryptPassword(password)

	const newUsers = [
		{
			_id: userId,
			login: {
				email: uEmail,
				password: pwd
			},
			account: {
				email: {
					valid: false,
					dateLastReq: nowDt,
					requestTimes: 1,
					hash: hashConfirmEmail
				},
				registrationDate: nowDt
			}
		}
	]
	console.debug('newUsers: ', JSON.stringify(newUsers, undefined, 2))

	await UserBase.create(newUsers, { session })
	return hashConfirmEmail
}
