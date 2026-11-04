/** A rank that passed the check and is waiting for its statement: hand it to `record` when the lock was taken. */
export interface ILockAdmission {
	readonly rank: number
}
