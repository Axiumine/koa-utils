import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import mongoose from 'mongoose'

import { EMAIL_CHECK_LINK } from './Constants.mjs'
import { incReqTimes } from './db/incReqTimes.mjs'

/**
 * l'hash dell'url di attivazione è errato
 * @param uId
 * @param uEmail
 * @param hash
 * @param requestTimes
 * @param dbHash
 */
export async function handleIfHashBad(
	uId: mongoose.Types.ObjectId,
	uEmail: string,
	hash: string,
	requestTimes: number = 0, // but the check is already performed
	dbHash?: string
) {
	if (hash !== dbHash) {
		// hash failed
		await incReqTimes(uId)

		const SocketLabsObj = new SocketLabsLib()
		await SocketLabsObj.wrongHash(uEmail, requestTimes + 1)
		throw new Error(EMAIL_CHECK_LINK)
	}
}
