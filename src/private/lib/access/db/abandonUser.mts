import { IVerifyEmailPaths, TAccessModel, TOnAbandon } from '@lib/access/accessPaths.mjs'

import { createDeleteUserByEmail, TDeleteUserByEmail } from './deleteUserByEmail.mjs'

/** Model, field map and disposal policy for {@link createAbandonUser}. */
export interface ICreateAbandonUserArgs {
	model: TAccessModel
	paths: IVerifyEmailPaths
	/** See {@link TOnAbandon}. */
	mode: TOnAbandon
	/**
	 * Value `'soft-delete'` writes to `paths.deleted`. A function is called once per write, so a layout
	 * storing a timestamp passes `() => new Date()`.
	 *
	 * Default `true`, matching `UserBase`, where `account.deleted` is `type: Boolean`. Not hard-coded: the
	 * guards only test the flag for truthiness, so what belongs in the slot is the schema's business.
	 */
	deletedValue?: unknown
}

/**
 * Build the writer the two abandonment guards call — `handleIfMoreThan3DaysPassed` (link older than 3 days)
 * and `handleIfTooMuchRequestsTimes` (fifth wrong hash).
 *
 * All three modes share one signature, so the guards stay unaware of which policy they are running under.
 * They throw either way: the mode decides what happens to the row, never whether the link is honoured.
 */
export const createAbandonUser = ({ model, paths, mode, deletedValue = true }: ICreateAbandonUserArgs): TDeleteUserByEmail => {
	if (mode === 'keep') {
		return async function keepUser(): Promise<void> {
			// Nothing to do: the caller disposes of abandoned registrations themselves.
			return undefined
		}
	}

	if (mode === 'soft-delete') {
		return async function softDeleteUserByEmail(email: string) {
			const value = typeof deletedValue === 'function' ? (deletedValue as () => unknown)() : deletedValue

			// Only the tombstone is written. The verification fields are left as they are — the flag is what
			// every guard reads, and unsetting members of a strict subdocument is what `verifyClear` exists for.
			await model.updateOne({ [paths.email]: email }, { $set: { [paths.deleted]: value } }, { runValidators: true })
		}
	}

	return createDeleteUserByEmail(model, paths)
}
