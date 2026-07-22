import { isSafeRedirectTarget } from '@lib/isSafeRedirectTarget.mjs'
import { IContextVerifyEmail } from '@private/graphQL/schema/context/IContextVerifyEmail.mjs'
import { assertVerifyEmailAllowed, TAssertVerifyEmailAllowed } from '@private/lib/access/assertVerifyEmailAllowed.mjs'
import { enableEmailAccess, TEnableEmailAccess } from '@private/lib/access/db/enableEmailAccess.mjs'
import { TUserData4VerifyEmail, userData4VerifyEmail } from '@private/lib/access/db/userData4VerifyEmail.mjs'

/** Reader, guard chain and writer the handler needs, all bound to the same model + paths by the caller. */
export interface IVerifyEmailRouterDeps {
	userData4VerifyEmail: TUserData4VerifyEmail
	assertVerifyEmailAllowed: TAssertVerifyEmailAllowed
	enableEmailAccess: TEnableEmailAccess
}

/**
 * Koa handler for the email-activation link.
 *
 * Taking the collaborators as arguments is what makes the handler testable at all: the DB read used to
 * be an ESM live binding that the tsx loader refuses to let sinon replace, so the whole try-body was
 * dead code in the suite and sat under a `c8 ignore`. It is now injected, the ignore is gone, and every
 * path is exercised directly.
 */
export const createVerifyEmailRouter = (deps: IVerifyEmailRouterDeps) => () => async (ctx: IContextVerifyEmail) => {
	const { email, hash } = ctx.params

	const uEmail = email.toLowerCase()

	try {
		// search if the email exists
		const user = await deps.userData4VerifyEmail(uEmail)

		// Every access guard lives in assertVerifyEmailAllowed, which is unit-tested.
		const uId = await deps.assertVerifyEmailAllowed(user, email, hash)

		// ok enable email — only ever reached once every guard above has passed
		await deps.enableEmailAccess(uId, email)
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

/** Shape of the bound router, for the modules that take it as a dependency. */
export type TVerifyEmailRouter = ReturnType<typeof createVerifyEmailRouter>

/** `UserBase`-bound default — the router every existing consumer already imports. */
export const routerVerifyEmail: TVerifyEmailRouter = createVerifyEmailRouter({
	userData4VerifyEmail,
	assertVerifyEmailAllowed,
	enableEmailAccess
})
