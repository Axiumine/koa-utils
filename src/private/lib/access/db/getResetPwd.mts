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
			resetHash = '' + queryRet.account.email.hash
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
