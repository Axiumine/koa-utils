import { createAssertVerifyEmailAllowed, TAssertVerifyEmailAllowed } from '@private/lib/access/assertVerifyEmailAllowed.mjs'
import { createAbandonUser } from '@private/lib/access/db/abandonUser.mjs'
import { createConfirmNewEmail, TConfirmNewEmail } from '@private/lib/access/db/confirmNewEmail.mjs'
import { TDeleteUserByEmail } from '@private/lib/access/db/deleteUserByEmail.mjs'
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
import { IVerifyEmailPaths, resolveVerifyEmailPaths, TAccessModel, TOnAbandon } from './accessPaths.mjs'

/** What the factory needs: the account model, plus any path or policy that differs from the default. */
export interface ICreateVerifyEmailFlowArgs {
	model: TAccessModel
	paths?: Partial<IVerifyEmailPaths>
	/** How an abandoned/expired registration is disposed of. Default `'delete'` — current behaviour. */
	onAbandon?: TOnAbandon
	/**
	 * Value `'soft-delete'` writes to `paths.deleted`. A function is called once per write, so a layout
	 * storing a timestamp passes `() => new Date()`. Default `true`, matching `UserBase`. Ignored by the
	 * other two modes.
	 */
	deletedValue?: unknown
	/** Full override of the disposal writer; wins over `onAbandon` and `deletedValue`. */
	deleteUserByEmail?: TDeleteUserByEmail
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
 * Two guards dispose of an abandoned registration — the fifth wrong hash and a link older than 3 days.
 * Through 5.6.1 that always meant `deleteOne`, which is wrong for any row other rows depend on: the
 * package has no idea what a delete costs in a schema it was handed, and a mongo collection has no
 * cascade to lean on. `onAbandon` picks the policy; `deleteUserByEmail` replaces the writer outright.
 * Whatever it does, both guards still throw — disposal never decides whether the link is honoured.
 *
 * Replacing `flow.deleteUserByEmail` on the returned object does nothing, by design: the guards close
 * over the writer at construction time. The value returned is the same one they hold, so it reports the
 * policy rather than setting it.
 *
 * ```ts
 * const flow = createVerifyEmailFlow({
 *     model: Account,
 *     paths: { email: 'mail', valid: 'verified', verifyClear: ['verification'] },
 *     onAbandon: 'soft-delete',
 *     deletedValue: () => new Date()
 * })
 * router.get('/check/verify-email/:email/:hash', flow.routerVerifyEmail())
 * ```
 */
export const createVerifyEmailFlow = ({
	model,
	paths,
	onAbandon = 'delete',
	deletedValue,
	deleteUserByEmail
}: ICreateVerifyEmailFlowArgs): IVerifyEmailFlow => {
	const resolved = resolveVerifyEmailPaths(paths)

	const userData4VerifyEmail = createUserData4VerifyEmail(model, resolved)
	const enableEmailAccess = createEnableEmailAccess(model, resolved)
	const confirmNewEmail = createConfirmNewEmail(model, resolved)
	// One writer, used by the guards and handed back — the returned member cannot disagree with what runs.
	const abandonUser = deleteUserByEmail ?? createAbandonUser({ model, paths: resolved, mode: onAbandon, deletedValue })
	const incReqTimes = createIncReqTimes(model, resolved)

	const assertVerifyEmailAllowed = createAssertVerifyEmailAllowed({
		paths: resolved,
		handleIfHashBad: createHandleIfHashBad(incReqTimes),
		handleIfMoreThan3DaysPassed: createHandleIfMoreThan3DaysPassed(abandonUser),
		handleIfTooMuchRequestsTimes: createHandleIfTooMuchRequestsTimes(abandonUser)
	})

	return {
		userData4VerifyEmail,
		setEmailHash: createSetEmailHash(model, resolved),
		enableEmailAccess,
		confirmNewEmail,
		deleteUserByEmail: abandonUser,
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
