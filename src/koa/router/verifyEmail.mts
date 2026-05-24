import { IContextVerifyEmail } from '@private/graphQL/schema/context/IContextVerifyEmail.mjs'
import { enableEmailAccess } from '@private/lib/access/db/enableEmailAccess.mjs'
import { userData4VerifyEmail } from '@private/lib/access/db/userData4VerifyEmail.mjs'
import { handleBadDB } from '@private/lib/access/handleBadDB.mjs'
import { handleIfAccountDeleted } from '@private/lib/access/handleIfAccountDeleted.mjs'
import { handleIfAccountDisabled } from '@private/lib/access/handleIfAccountDisabled.mjs'
import { handleIfEmailAlreadyValid } from '@private/lib/access/handleIfEmailAlreadyValid.mjs'
import { handleIfHashBad } from '@private/lib/access/handleIfHashBad.mjs'
import { handleIfMoreThan3DaysPassed } from '@private/lib/access/handleIfMoreThan3DaysPassed.mjs'
import { handleIfTooMuchRequestsTimes } from '@private/lib/access/handleIfTooMuchRequestsTimes.mjs'


// allow url encoded urls after /x/
const ALLOW_ENCODED_URLS_AFTER_X = /^\/x\/[a-zA-Z0-9._\-%/]+$/

export const routerVerifyEmail = () => async (ctx: IContextVerifyEmail) => {
	const { email, hash } = ctx.params

	const uEmail = email.toLowerCase()

	try {
		// search if the email exists
		const user = await userData4VerifyEmail(uEmail)
		const uId = user._id
		const userAccount = user.account
		const userAccountEmail = userAccount.email
		const requestTimes = userAccountEmail.requestTimes
		const dateLastReq = userAccountEmail.dateLastReq
		const { deleted, disabled } = userAccount

		await handleIfEmailAlreadyValid(email, userAccountEmail.valid)
		handleBadDB(requestTimes, dateLastReq)
		await handleIfTooMuchRequestsTimes(email, requestTimes)
		await handleIfHashBad(
			uId,
			email,
			hash,
			requestTimes,
			userAccountEmail.hash
		)

		await handleIfMoreThan3DaysPassed(email, dateLastReq)
		await handleIfAccountDeleted(email, deleted)
		await handleIfAccountDisabled(email, disabled)

		// ok enable email
		await enableEmailAccess(uId, email)
		ctx.redirect('/x/registration-done') // url without prefix
		// ctx.redirect('https://google.it') // external url
	} catch (err: unknown) {
		const link = (err as Error).message as string
		if (ALLOW_ENCODED_URLS_AFTER_X.test(link)) {
			ctx.redirect(link)
		} else {
			ctx.redirect('/x/error')
		}
	}
}
