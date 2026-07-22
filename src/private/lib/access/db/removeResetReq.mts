import { DEFAULT_RESET_PWD_PATHS, IResetPwdPaths, TAccessModel } from '@lib/access/accessPaths.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { buildUnset } from '@private/lib/access/pathTools.mjs'
import { ClientSession } from 'mongoose'

export const createRemoveResetReq = (model: TAccessModel, paths: IResetPwdPaths) =>
	async function removeResetReq(session: ClientSession, email: string) {
		// No { upsert: true }. An upsert on a clearing operation is backwards: when the email matched no
		// document MongoDB did not no-op, it inserted one keyed by the login-email path — and updateOne
		// skips validators, so that row bypassed every required field in the schema (password,
		// email.valid, registrationDate). A no-op is the only correct answer to "clear the reset state of
		// a user that does not exist".
		//
		// The unset list comes from paths.resetClear, NOT from the fields saveResetReq writes. A layout
		// holding the request in one required subdocument can only be cleared by unsetting the container;
		// unsetting its members leaves a document that fails validation and the write is rejected.
		return model
			.updateOne({ [paths.email]: email }, { $unset: buildUnset(paths.resetClear) })
			.session(session)
			.exec()
	}

/** Signature of the bound writer, for the modules that take it as a dependency. */
export type TRemoveResetReq = ReturnType<typeof createRemoveResetReq>

/** `UserBase`-bound default — the behaviour every existing consumer already imports. */
export default createRemoveResetReq(UserBase, DEFAULT_RESET_PWD_PATHS)
