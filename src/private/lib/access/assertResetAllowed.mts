import { DateLib } from '@lib/DateLib.mjs'
import type { IResetPwdRecord } from '@private/lib/access/db/getResetPwd.mjs'
import * as Sentry from '@sentry/node'
import { throwForbiddenError } from '@throw/throwForbiddenError.mjs'

import { safeEqualSecret } from './safeEqualSecret.mjs'

/** Minutes a reset link stays valid after the request was made. */
const RESET_LINK_LIFETIME_MIN = 60

/**
 * Decide whether a password reset may proceed for the record `getResetPwd` returned.
 *
 * Every rejection throws the same `throwForbiddenError()` (403), so a caller cannot tell an unknown
 * address, an account with no reset pending, a wrong hash and an expired link apart. The hash is compared
 * in constant time through `safeEqualSecret`. Extracted from `updatePassword` with the order of the checks
 * unchanged, only to keep that resolver inside its complexity budget.
 *
 * @param resetPwd - the stored reset state, or `null` when no account matches the address
 * @param uEmail - the normalised address, used only in the Sentry reports
 * @param hash - the reset hash the caller sent
 */
export function assertResetAllowed(
	resetPwd: IResetPwdRecord | null,
	uEmail: string,
	hash: string
): asserts resetPwd is IResetPwdRecord {
	// check if email is present in db
	if (resetPwd === null) {
		throw throwForbiddenError() // don't reveal whether the email is present, for privacy
	}

	// No usable reset state. This is NOT an internal error as far as the caller is concerned:
	// answering 500 here while an unknown address answers 403 turns this mutation into an
	// account-enumeration oracle, because every registered account that has never requested a
	// reset lands on this branch (getResetPwd yields resetHash === null whenever
	// account.resetDateReq is undefined). Same 403 as the unknown-address path; the orphan
	// state is reported to Sentry instead of to the caller.
	if (resetPwd.resetHash === null) {
		Sentry.captureMessage(`[updatePassword] no usable resetHash for ${uEmail}`)
		throw throwForbiddenError()
	}
	// A stored `null` date is not typed as possible, but a lean read returns exactly that for an explicit
	// null in the document, so the guard is reachable. Read as unknown to keep the check honest.
	const resetDateReq: unknown = resetPwd.resetDateReq
	if (resetDateReq === null) {
		Sentry.captureMessage(`[updatePassword] resetHash set but resetDateReq missing for ${uEmail}`)
		throw throwForbiddenError()
	}

	// check if hash is missing or invalid
	if (!safeEqualSecret(resetPwd.resetHash, hash)) {
		throw throwForbiddenError() // don't reveal whether the email is present, for privacy
	}

	// check if the request was made within 1 hour
	const dt1 = new Date(String(resetPwd.resetDateReq))
	if (DateLib.minElapsed(dt1) > RESET_LINK_LIFETIME_MIN) {
		throw throwForbiddenError() // The link is no longer valid
	}
}
