import { LogGlobalError } from '@models/MongoDB/log/LogGlobalError.mjs'

/** Payload accepted by `logGlobalError`. Exported so a consumer re-exporting the helper can name its type. */
export interface IGlobalError {
	message: string
	stackArr: Array<string>
}

export const logGlobalError = function (log: IGlobalError) {
	if (log.message === '' && log.stackArr.length === 0) return

	const newGlobalError = new LogGlobalError({})
	if (log.message !== '') newGlobalError.m = log.message
	if (log.stackArr.length !== 0) newGlobalError.s = log.stackArr

	// return newGlobalError.save()
}
