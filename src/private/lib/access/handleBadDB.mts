import * as Sentry from '@sentry/node'

import { EMAIL_CHECK_LINK } from './Constants.mjs'

/**
 * A stored hash without its bookkeeping fields is our bug, not the caller's.
 *
 * It redirects exactly where a hash mismatch, an expired link and an unknown address redirect — that is the
 * point. Through 5.6.1 this branch threw `/x/error` while an unknown address threw `EMAIL_CHECK_LINK`, so two
 * distinguishable responses answered an unauthenticated GET and the pair told anybody who asked whether an
 * address had an account. Worse on data predating the verification fields, where every real account answered
 * `/x/error` and every unknown one answered the other: a clean enumeration oracle.
 *
 * The distinction is kept where it belongs — Sentry, which is who needs to know.
 */
export function handleBadDB(requestTimes?: number, dateLastReq?: Date) {
	if (typeof requestTimes === 'undefined' || dateLastReq === undefined) {
		Sentry.captureMessage('[handleBadDB] DB ERROR', 'error')

		// it's an our error !! cannot be present the hash without requestTimes!
		throw new Error(EMAIL_CHECK_LINK)
	}
}
