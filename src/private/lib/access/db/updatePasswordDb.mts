import { DEFAULT_RESET_PWD_PATHS, IResetPwdPaths, TAccessModel } from '@lib/access/accessPaths.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { hash } from '@node-rs/bcrypt'
import { SALT_ROUNDS } from '@private/lib/access/Constants.mjs'
import mongoose, { ClientSession } from 'mongoose'

export const createUpdatePasswordDb = (model: TAccessModel, paths: IResetPwdPaths) =>
	async function updatePassword(session: ClientSession, _id: mongoose.Types.ObjectId, password: string) {
		const hashVal = await hash(password, SALT_ROUNDS)

		// Field names come from the `paths` map fixed when the flow is built, never from request data; only the values do.
		// nosemgrep: koa-utils.nosql-injection.mass-assignment-update-doc
		return model.updateOne({ _id }, { $set: { [paths.password]: hashVal } }, { session, runValidators: true })
	}

/** Signature of the bound writer, for the modules that take it as a dependency. */
export type TUpdatePasswordDb = ReturnType<typeof createUpdatePasswordDb>

/** `UserBase`-bound default — the behaviour every existing consumer already imports. */
export default createUpdatePasswordDb(UserBase, DEFAULT_RESET_PWD_PATHS)
