import type { IDbClockReason } from './IDbClockReason.mjs'

/** The fixed message of each reason: no value, no statement text, no driver text. */
function messageOf(reason: IDbClockReason): string {
	switch (reason) {
		case 'WRITE_BEFORE_LOCK':
			return 'the clock of a write transaction is read after the first lock helper has returned, not before'
		case 'NOT_READ':
			return 'the instant of this transaction was not read yet: await clock.read() once before now()'
		case 'ALREADY_BOUND':
			return 'this transaction already has a clock'
		case 'SEAM_REFUSED':
			return 'the test seam of the clock is not allowed here'
		case 'BAD_RESULT':
			return 'the clock statement did not answer one int8 value'
		case 'UNSAFE_INSTANT':
			return 'the database instant is not a safe integer number of milliseconds'
	}
}

/** The programming or configuration error of the database clock. The message is fixed and holds no value. */
export class DbClockError extends Error {
	readonly reason: IDbClockReason

	constructor(reason: IDbClockReason) {
		super(messageOf(reason))
		this.name = 'DbClockError'
		this.reason = reason
	}
}
