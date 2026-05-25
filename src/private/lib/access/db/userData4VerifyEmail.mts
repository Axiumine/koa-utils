import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { EMAIL_CHECK_LINK } from '@private/lib/access/Constants.mjs'
import * as Sentry from '@sentry/node'

export async function userData4VerifyEmail(uEmail: string) {
	const user = await UserBase.findOne({ 'login.email': uEmail })
		.select(
			'_id account.email.hash account.email.valid account.email.dateLastReq account.email.requestTimes ' +
				'account.deleted account.disabled'
		)
		.lean()

	// if email not found, return stNotFoundNotMatch
	if (user === null) {
		Sentry.captureMessage(`User ${uEmail} not exist`)

		throw new Error(EMAIL_CHECK_LINK)
	}
	return user
}
