import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { ClientSession } from 'mongoose'

export default async function removeResetReq(session: ClientSession, email: string) {
	// No { upsert: true }. An upsert on a clearing operation is backwards: when the email matched no
	// document MongoDB did not no-op, it inserted one keyed by login.email — and updateOne skips
	// validators, so that row bypassed every required field in the schema (login.password,
	// account.email.valid, account.registrationDate). A no-op is the only correct answer to "clear the
	// reset state of a user that does not exist".
	return UserBase.updateOne({ 'login.email': email }, { $unset: { 'account.resetDateReq': '', 'account.resetHash': '' } })
		.session(session)
		.exec()
}
