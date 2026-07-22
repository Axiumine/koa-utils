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
			.select(buildProjection([paths.name, paths.resetDateReq, paths.resetHash, paths.deleted, paths.disabled]))
			.session(session)
			.lean()

		// if a reset request is found
		if (queryRet !== null) {
			// A tombstoned or locked-out account is not a reset target: without this, resetPwd mailed a
			// live link to a deleted address and updatePassword overwrote the bcrypt hash of a disabled
			// one, so re-enabling the account handed it back with an attacker-chosen password. `null` is
			// the same answer an unknown address gets — resetPwd returns true and sends nothing,
			// updatePassword answers the same 403 — so no new enumeration oracle is opened.
			//
			// The flags are read raw, exactly as assertVerifyEmailAllowed reads them. This is a .lean()
			// read, so Mongoose casting never runs and these are what the driver found: a boolean once
			// scripts/migrate-account-disabled-to-boolean.mjs has run. On un-migrated data a stored
			// 'false' is a truthy string and blocks the reset; the fix is the migration, not a coercion
			// here.
			if (readPath(queryRet, paths.deleted) || readPath(queryRet, paths.disabled)) {
				return null
			}

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
