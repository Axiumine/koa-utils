import * as Sentry from '@sentry/node'

export function handleBadDB(requestTimes?: number, dateLastReq?: Date) {
	if (typeof requestTimes === 'undefined' || dateLastReq === undefined) {
		Sentry.captureMessage('[handleBadDB] DB ERROR', 'error')

		// it's an our error !! cannot be present the hash without requestTimes!
		throw new Error('/x/error')
	}
}
