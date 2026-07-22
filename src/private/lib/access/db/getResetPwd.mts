import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { ClientSession } from 'mongoose'

export const getResetPwd = async function (session: ClientSession, email: string) {
	let ret = null

	const queryRet = await UserBase.findOne({ 'login.email': email })
		.select('_id personalData.name account.resetDateReq account.resetHash')
		.session(session)
		.lean()

	// if a reset request is found
	if (queryRet !== null) {
		const resetDateReq = queryRet.account.resetDateReq
		let resetHash = null

		if (typeof resetDateReq !== 'undefined') {
			const storedHash = queryRet.account.resetHash

			// Never stringify, and never fall back to account.email.hash. '' + undefined yields the
			// literal string "undefined", which passed updatePassword's null check and then matched a
			// caller sending that same literal as the hash argument — a reset with no secret at all.
			// The two fields must also stay disjoint: reading the verification slot here is what let a
			// hash issued by one flow authenticate the other. Anything but a stored string => null,
			// which updatePassword rejects with the same 403 it gives an unknown address.
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
