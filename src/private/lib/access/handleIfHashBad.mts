import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import mongoose from 'mongoose'

import { EMAIL_CHECK_LINK } from './Constants.mjs'
import { incReqTimes, TIncReqTimes } from './db/incReqTimes.mjs'

interface IHandleIfHashBadArgs {
	uId: mongoose.Types.ObjectId
	uEmail: string
	hash: string
	requestTimes?: number // but the check is already performed
	dbHash?: string
}

/**
 * The hash in the activation url is wrong.
 *
 * The strike counter is bumped through an injected writer so the guard can serve a model other than
 * `UserBase`: the counter path itself lives in the verify-email `paths` map the writer was built with.
 */
export const createHandleIfHashBad = (incReqTimesFn: TIncReqTimes) =>
	async function handleIfHashBad({ uId, uEmail, hash, requestTimes = 0, dbHash }: IHandleIfHashBadArgs) {
		if (hash !== dbHash) {
			// hash failed
			await incReqTimesFn(uId)

			const SocketLabsObj = new SocketLabsLib()
			await SocketLabsObj.wrongHash(uEmail, requestTimes + 1)
			throw new Error(EMAIL_CHECK_LINK)
		}
	}

/** Signature of the bound guard, for the modules that take it as a dependency. */
export type THandleIfHashBad = ReturnType<typeof createHandleIfHashBad>

/** `UserBase`-bound default — the behaviour every existing consumer already imports. */
export const handleIfHashBad: THandleIfHashBad = createHandleIfHashBad(incReqTimes)
