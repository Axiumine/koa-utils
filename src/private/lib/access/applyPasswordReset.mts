import type { TGetResetPwd } from '@private/lib/access/db/getResetPwd.mjs'
import type { TRemoveResetReq } from '@private/lib/access/db/removeResetReq.mjs'
import type { TUpdatePasswordDb } from '@private/lib/access/db/updatePasswordDb.mjs'
import { throwInternalError } from '@throw/throwInternalError.mjs'
import type { ClientSession } from 'mongoose'

import { assertResetAllowed } from './assertResetAllowed.mjs'

/** The reader and writers the reset transaction needs, all bound to the same model and paths by the caller. */
export interface IApplyPasswordResetDeps {
	getResetPwd: TGetResetPwd
	updatePasswordDb: TUpdatePasswordDb
	removeResetReq: TRemoveResetReq
}

/** Normalised inputs the transaction body works on, bundled to keep it within the max-params budget. */
export interface IApplyPasswordResetInput {
	uEmail: string
	hash: string
	password: string
}

/**
 * The transactional core of `updatePassword`: validate the reset hash, apply the new password and clear the
 * request. Extracted from the resolver only to keep it inside its complexity budget — behaviour unchanged.
 * Returns the account holder's name so the caller can mail the post-commit confirmation.
 */
export async function applyPasswordReset(
	deps: IApplyPasswordResetDeps,
	session: ClientSession,
	input: IApplyPasswordResetInput
): Promise<string> {
	const { uEmail, hash, password } = input
	const resetPwd = await deps.getResetPwd(session, uEmail)

	assertResetAllowed(resetPwd, uEmail, hash)

	// typed unknown on purpose: the writer is injected, and a falsy result (not a thrown error) has always meant failure
	const update: unknown = await deps.updatePasswordDb(session, resetPwd._id, password)
	if (!update) {
		throw throwInternalError() // "System error while updating the password."
	}

	// delete password reset request data from db
	await deps.removeResetReq(session, uEmail)

	// the confirmation email is sent after the commit, not here
	return resetPwd.name
}
