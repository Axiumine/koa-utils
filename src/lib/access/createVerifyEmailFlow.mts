import { createAssertVerifyEmailAllowed, TAssertVerifyEmailAllowed } from '@private/lib/access/assertVerifyEmailAllowed.mjs'
import { createConfirmNewEmail, TConfirmNewEmail } from '@private/lib/access/db/confirmNewEmail.mjs'
import { createDeleteUserByEmail, TDeleteUserByEmail } from '@private/lib/access/db/deleteUserByEmail.mjs'
import { createEnableEmailAccess, TEnableEmailAccess } from '@private/lib/access/db/enableEmailAccess.mjs'
import { createIncReqTimes, TIncReqTimes } from '@private/lib/access/db/incReqTimes.mjs'
import { createSetEmailHash, TSetEmailHash } from '@private/lib/access/db/setEmailHash.mjs'
import { createUserData4VerifyEmail, TUserData4VerifyEmail } from '@private/lib/access/db/userData4VerifyEmail.mjs'
import { createHandleIfHashBad } from '@private/lib/access/handleIfHashBad.mjs'
import { createHandleIfMoreThan3DaysPassed } from '@private/lib/access/handleIfMoreThan3DaysPassed.mjs'
import { createHandleIfTooMuchRequestsTimes } from '@private/lib/access/handleIfTooMuchRequestsTimes.mjs'

import {
	createEmailChangeHashVerifyMutation,
	TEmailChangeHashVerifyMutation
} from '../../graphQL/schema/mutations/emailChangeHashVerify.mjs'
import { createVerifyEmailRouter, TVerifyEmailRouter } from '../../koa/router/verifyEmail.mjs'
import { IVerifyEmailPaths, resolveVerifyEmailPaths, TAccessModel } from './accessPaths.mjs'

/** What the factory needs: the account model, plus any path that differs from the default layout. */
export interface ICreateVerifyEmailFlowArgs {
	model: TAccessModel
	paths?: Partial<IVerifyEmailPaths>
}

/** Everything the verify-email chain exposes, bound to the model and paths passed in. */
export interface IVerifyEmailFlow {
	userData4VerifyEmail: TUserData4VerifyEmail
	setEmailHash: TSetEmailHash
	enableEmailAccess: TEnableEmailAccess
	confirmNewEmail: TConfirmNewEmail
	deleteUserByEmail: TDeleteUserByEmail
	incReqTimes: TIncReqTimes
	assertVerifyEmailAllowed: TAssertVerifyEmailAllowed
	emailChangeHashVerify: TEmailChangeHashVerifyMutation
	routerVerifyEmail: TVerifyEmailRouter
}

/**
 * Build the whole email-verification chain against any mongoose model.
 *
 * The package's own exports (`userData4VerifyEmail`, `setEmailHash`, `enableEmailAccess`,
 * `confirmNewEmail`, `emailChangeHashVerify`, `routerVerifyEmail`) are this factory applied to
 * `UserBase` with `DEFAULT_VERIFY_EMAIL_PATHS`, so switching to it changes nothing until a path is
 * overridden.
 *
 * The two `*Clear` keys are lists of paths to `$unset`, and neither is derived from the leaf paths the
 * flow reads: a schema storing the verification state as one required-members subdocument is left
 * invalid by unsetting a single member. Pass the container path in that case. See `IVerifyEmailPaths`.
 *
 * ```ts
 * const flow = createVerifyEmailFlow({
 *     model: Account,
 *     paths: { email: 'mail', valid: 'verified', verifyClear: ['verification'] }
 * })
 * router.get('/check/verify-email/:email/:hash', flow.routerVerifyEmail())
 * ```
 */
export const createVerifyEmailFlow = ({ model, paths }: ICreateVerifyEmailFlowArgs): IVerifyEmailFlow => {
	const resolved = resolveVerifyEmailPaths(paths)

	const userData4VerifyEmail = createUserData4VerifyEmail(model, resolved)
	const enableEmailAccess = createEnableEmailAccess(model, resolved)
	const confirmNewEmail = createConfirmNewEmail(model, resolved)
	const deleteUserByEmail = createDeleteUserByEmail(model, resolved)
	const incReqTimes = createIncReqTimes(model, resolved)

	const assertVerifyEmailAllowed = createAssertVerifyEmailAllowed({
		paths: resolved,
		handleIfHashBad: createHandleIfHashBad(incReqTimes),
		handleIfMoreThan3DaysPassed: createHandleIfMoreThan3DaysPassed(deleteUserByEmail),
		handleIfTooMuchRequestsTimes: createHandleIfTooMuchRequestsTimes(deleteUserByEmail)
	})

	return {
		userData4VerifyEmail,
		setEmailHash: createSetEmailHash(model, resolved),
		enableEmailAccess,
		confirmNewEmail,
		deleteUserByEmail,
		incReqTimes,
		assertVerifyEmailAllowed,
		emailChangeHashVerify: createEmailChangeHashVerifyMutation({
			model,
			paths: resolved,
			confirmNewEmail,
			incReqTimes
		}),
		routerVerifyEmail: createVerifyEmailRouter({
			userData4VerifyEmail,
			assertVerifyEmailAllowed,
			enableEmailAccess
		})
	}
}
