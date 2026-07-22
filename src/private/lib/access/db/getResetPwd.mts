import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { ClientSession } from 'mongoose'

export const getResetPwd = async function (session: ClientSession, email: string) {
	let ret = null

	const queryRet = await UserBase.findOne({ 'login.email': email })
		.select('_id personalData.name account.resetDateReq account.email.hash')
		.session(session)
		.lean()

	// if a reset request is found
	if (queryRet !== null) {
		const resetDateReq = queryRet.account.resetDateReq
		let resetHash = null

		if (typeof resetDateReq !== 'undefined') {
			const storedHash = queryRet.account.email.hash

			// Never stringify: account.email.hash is a slot shared with the email-verification and
			// email-change flows, so enableEmailAccess / confirmNewEmail can clear it while
			// account.resetDateReq survives. '' + undefined yields the literal string "undefined",
			// which passed updatePassword's null check and then matched a caller sending that same
			// literal as the hash argument — a reset with no secret at all. Absent hash => null,
			// which updatePassword rejects with a 500.
			if (typeof storedHash === 'string') {
				resetHash = storedHash
			}
		}

		ret = {
			_id: queryRet._id,
			resetDateReq,
			resetHash,
			name: queryRet.personalData?.name || ''
		}
	}
	return ret
}
