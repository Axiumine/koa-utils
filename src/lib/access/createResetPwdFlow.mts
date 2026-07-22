import { createGetResetPwd } from '@private/lib/access/db/getResetPwd.mjs'
import { createRemoveResetReq } from '@private/lib/access/db/removeResetReq.mjs'
import { createSaveResetReq } from '@private/lib/access/db/saveResetReq.mjs'
import { createUpdatePasswordDb } from '@private/lib/access/db/updatePasswordDb.mjs'

import { createResetPwdMutation, TResetPwdMutation } from '../../graphQL/schema/mutations/resetPwd.mjs'
import { createUpdatePasswordMutation, TUpdatePasswordMutation } from '../../graphQL/schema/mutations/updatePassword.mjs'
import { IResetPwdPaths, resolveResetPwdPaths, TAccessModel } from './accessPaths.mjs'

/** What the factory needs: the account model, plus any path that differs from the default layout. */
export interface ICreateResetPwdFlowArgs {
	model: TAccessModel
	paths?: Partial<IResetPwdPaths>
}

/** The two mutations the flow exposes, bound to the model and paths passed in. */
export interface IResetPwdFlow {
	resetPwd: TResetPwdMutation
	updatePassword: TUpdatePasswordMutation
}

/**
 * Build the password-reset mutations against any mongoose model.
 *
 * The package's own `resetPwd` / `updatePassword` exports are this factory applied to `UserBase` with
 * `DEFAULT_RESET_PWD_PATHS`, so switching to it changes nothing until a path is overridden.
 *
 * Every key of `paths` is optional and falls back to the default layout. `resetClear` is the one to
 * look at twice: it is the list of paths the cleanup `$unset`s, and it is NOT derived from
 * `resetDateReq` + `resetHash`. A schema storing the request as one required-members subdocument under
 * `validationLevel: 'strict'` is left invalid by unsetting a single member, and the write is rejected —
 * such a schema must pass the container path instead. See `IResetPwdPaths.resetClear`.
 *
 * ```ts
 * const { resetPwd, updatePassword } = createResetPwdFlow({
 *     model: Account,
 *     paths: { email: 'mail', password: 'pwd', name: 'profile.fullName', resetClear: ['resetPwd'] }
 * })
 * ```
 */
export const createResetPwdFlow = ({ model, paths }: ICreateResetPwdFlowArgs): IResetPwdFlow => {
	const resolved = resolveResetPwdPaths(paths)

	const getResetPwd = createGetResetPwd(model, resolved)

	return {
		resetPwd: createResetPwdMutation({
			getResetPwd,
			saveResetReq: createSaveResetReq(model, resolved)
		}),
		updatePassword: createUpdatePasswordMutation({
			getResetPwd,
			updatePasswordDb: createUpdatePasswordDb(model, resolved),
			removeResetReq: createRemoveResetReq(model, resolved)
		})
	}
}
