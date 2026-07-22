import { DEFAULT_VERIFY_EMAIL_PATHS, IVerifyEmailPaths } from '@lib/access/accessPaths.mjs'
import { Types } from 'mongoose'

import { handleBadDB } from './handleBadDB.mjs'
import { handleIfAccountDeleted } from './handleIfAccountDeleted.mjs'
import { handleIfAccountDisabled } from './handleIfAccountDisabled.mjs'
import { handleIfEmailAlreadyValid } from './handleIfEmailAlreadyValid.mjs'
import { handleIfHashBad, THandleIfHashBad } from './handleIfHashBad.mjs'
import { handleIfMoreThan3DaysPassed, THandleIfMoreThan3DaysPassed } from './handleIfMoreThan3DaysPassed.mjs'
import { handleIfTooMuchRequestsTimes, THandleIfTooMuchRequestsTimes } from './handleIfTooMuchRequestsTimes.mjs'
import { readPath } from './pathTools.mjs'

/** The projection userData4VerifyEmail selects under the default paths, as the guard chain needs it. */
export interface IVerifyEmailUser {
	_id: Types.ObjectId
	account: {
		email: {
			hash?: string
			valid: boolean
			dateLastReq?: Date
			requestTimes?: number
		}
		deleted?: boolean
		disabled?: boolean
	}
}

/** Collaborators the chain needs, all bound to the same model + paths by the caller. */
export interface IAssertVerifyEmailAllowedDeps {
	paths: IVerifyEmailPaths
	handleIfHashBad: THandleIfHashBad
	handleIfMoreThan3DaysPassed: THandleIfMoreThan3DaysPassed
	handleIfTooMuchRequestsTimes: THandleIfTooMuchRequestsTimes
}

/**
 * Run every guard that must pass before an email-verification link is honoured, in order.
 *
 * Extracted from routerVerifyEmail so the sequence is reachable by tests. Inside the
 * router it was not: the handler's only entry point performs a DB read, which cannot be
 * stubbed under the tsx loader (ESM live bindings), so in the suite it always rejected
 * and the whole try-body was dead code — sitting under a `c8 ignore` besides. Mutation
 * testing confirmed the cost: deleting the disabled-account guard, negating the deleted
 * flag, comparing the URL hash against ITSELF instead of the stored one, hard-coding
 * requestTimes to 0, and dropping the `await` on the hash check ALL left the suite green.
 * Each guard had thorough unit tests of its own; nothing tested that the router called
 * them, with the right values, in the right order.
 *
 * Throws (via the handleIf* guards) when the link must not be honoured. Returns the user
 * id to enable when every guard passes.
 *
 * Enabling the account is deliberately NOT done here. The caller performs it on the
 * returned id, so the irreversible side effect cannot be reordered ahead of a guard —
 * a mutation that did exactly that also survived.
 *
 * The document is read through `paths` rather than by fixed property access, so the same
 * chain serves any account layout. Nothing else about the sequence changes.
 */
export const createAssertVerifyEmailAllowed = (deps: IAssertVerifyEmailAllowedDeps) =>
	async function assertVerifyEmailAllowed(user: unknown, email: string, hash: string): Promise<Types.ObjectId> {
		const { paths } = deps
		const uId = readPath(user, '_id') as Types.ObjectId
		const requestTimes = readPath(user, paths.requestTimes) as number | undefined
		const dateLastReq = readPath(user, paths.dateLastReq) as Date | undefined
		const deleted = readPath(user, paths.deleted) as boolean | undefined
		const disabled = readPath(user, paths.disabled) as boolean | undefined

		await handleIfEmailAlreadyValid(email, readPath(user, paths.valid) as boolean)
		handleBadDB(requestTimes, dateLastReq)
		await deps.handleIfTooMuchRequestsTimes(email, requestTimes)
		// dbHash is the value STORED for this account — never the one supplied in the URL
		await deps.handleIfHashBad({
			uId,
			uEmail: email,
			hash,
			requestTimes,
			dbHash: readPath(user, paths.hash) as string | undefined
		})

		await deps.handleIfMoreThan3DaysPassed(email, dateLastReq)
		// The flags are passed raw. userData4VerifyEmail reads .lean(), so Mongoose casting never runs
		// and these are exactly what the driver found — which is only ever a boolean once
		// scripts/migrate-account-disabled-to-boolean.mjs has run. On un-migrated data a stored 'false'
		// is a truthy string and blocks the account; the fix is the migration, not a coercion here.
		await handleIfAccountDeleted(email, deleted)
		await handleIfAccountDisabled(email, disabled)

		return uId
	}

/** Signature of the bound chain, for the modules that take it as a dependency. */
export type TAssertVerifyEmailAllowed = ReturnType<typeof createAssertVerifyEmailAllowed>

/** `UserBase`-bound default — the behaviour every existing consumer already imports. */
export const assertVerifyEmailAllowed: TAssertVerifyEmailAllowed = createAssertVerifyEmailAllowed({
	paths: DEFAULT_VERIFY_EMAIL_PATHS,
	handleIfHashBad,
	handleIfMoreThan3DaysPassed,
	handleIfTooMuchRequestsTimes
})
