import { isSafeRedirectTarget } from '@lib/isSafeRedirectTarget.mjs'
import { IContextVerifyEmail } from '@private/graphQL/schema/context/IContextVerifyEmail.mjs'
import { assertVerifyEmailAllowed } from '@private/lib/access/assertVerifyEmailAllowed.mjs'
import { enableEmailAccess } from '@private/lib/access/db/enableEmailAccess.mjs'
import { userData4VerifyEmail } from '@private/lib/access/db/userData4VerifyEmail.mjs'

/* c8 ignore start -- ESM live-binding limit: inner async handler stubs (@private/lib/access/*) are non-configurable in tsx loader, integration coverage on consumer */
export const routerVerifyEmail = () => async (ctx: IContextVerifyEmail) => {
	const { email, hash } = ctx.params

	const uEmail = email.toLowerCase()

	try {
		// search if the email exists
		const user = await userData4VerifyEmail(uEmail)

		// Every access guard lives in assertVerifyEmailAllowed, which is unit-tested.
		// This handler is unreachable in the suite (the DB read above cannot be stubbed
		// under the tsx loader), so any logic left inline here is untestable by
		// construction — see the note on that function.
		const uId = await assertVerifyEmailAllowed(user, email, hash)

		// ok enable email — only ever reached once every guard above has passed
		await enableEmailAccess(uId, email)
		ctx.redirect('/x/registration-done') // url without prefix
		// ctx.redirect('https://google.it') // external url
	} catch (err: unknown) {
		const link = (err as Error).message as string
		if (isSafeRedirectTarget(link)) {
			ctx.redirect(link)
		} else {
			ctx.redirect('/x/error')
		}
	}
}
/* c8 ignore stop */
