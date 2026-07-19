import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import mongoose from 'mongoose'

import { EMAIL_CHECK_LINK } from './Constants.mjs'
import { incReqTimes } from './db/incReqTimes.mjs'

interface IHandleIfHashBadArgs {
	uId: mongoose.Types.ObjectId
	uEmail: string
	hash: string
	requestTimes?: number // but the check is already performed
	dbHash?: string
}

/**
 * The hash in the activation url is wrong
 * @param args
 */
export async function handleIfHashBad({ uId, uEmail, hash, requestTimes = 0, dbHash }: IHandleIfHashBadArgs) {
	if (hash !== dbHash) {
		// hash failed
		await incReqTimes(uId)

		const SocketLabsObj = new SocketLabsLib()
		await SocketLabsObj.wrongHash(uEmail, requestTimes + 1)
		throw new Error(EMAIL_CHECK_LINK)
	}
}
