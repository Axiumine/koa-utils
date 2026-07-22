import { DEFAULT_RESET_PWD_PATHS, IResetPwdPaths, TAccessModel } from '@lib/access/accessPaths.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { buildProjection, readPath } from '@private/lib/access/pathTools.mjs'
import { ClientSession, Types } from 'mongoose'

/** What the reset flow needs about an account, flattened out of whatever layout `paths` describes. */
export interface IResetPwdRecord {
	_id: Types.ObjectId
	resetDateReq: Date | undefined
	resetHash: string | null
	name: string
}

export const createGetResetPwd = (model: TAccessModel, paths: IResetPwdPaths) =>
	async function getResetPwd(session: ClientSession, email: string): Promise<IResetPwdRecord | null> {
		let ret: IResetPwdRecord | null = null

		const queryRet = await model
			.findOne({ [paths.email]: email })
			.select(buildProjection([paths.name, paths.resetDateReq, paths.resetHash]))
			.session(session)
			.lean()

		// if a reset request is found
		if (queryRet !== null) {
			const resetDateReq = readPath(queryRet, paths.resetDateReq) as Date | undefined
			let resetHash: string | null = null

			if (typeof resetDateReq !== 'undefined') {
				const storedHash = readPath(queryRet, paths.resetHash)

				// Never stringify, and never fall back to the email-verification hash slot. '' + undefined
				// yields the literal string "undefined", which passed updatePassword's null check and then
				// matched a caller sending that same literal as the hash argument — a reset with no secret
				// at all. The two fields must also stay disjoint: reading the verification slot here is
				// what let a hash issued by one flow authenticate the other. Anything but a stored string
				// => null, which updatePassword rejects with the same 403 it gives an unknown address.
				if (typeof storedHash === 'string') {
					resetHash = storedHash
				}
			}

			ret = {
				_id: queryRet._id as Types.ObjectId,
				resetDateReq,
				resetHash,
				name: (readPath(queryRet, paths.name) as string | undefined) || ''
			}
		}
		return ret
	}

/** Signature of the bound reader, for the modules that take it as a dependency. */
export type TGetResetPwd = ReturnType<typeof createGetResetPwd>

/** `UserBase`-bound default — the behaviour every existing consumer already imports. */
export const getResetPwd: TGetResetPwd = createGetResetPwd(UserBase, DEFAULT_RESET_PWD_PATHS)
