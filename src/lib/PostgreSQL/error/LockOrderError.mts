import type { ILockOrderReason } from './ILockOrderReason.mjs'

/** The programming error of the lock-order tracker. The message names the ranks and the helper; it holds no id. */
export class LockOrderError extends Error {
	readonly reason: ILockOrderReason

	constructor(reason: ILockOrderReason, message: string) {
		super(message)
		this.name = 'LockOrderError'
		this.reason = reason
	}
}
