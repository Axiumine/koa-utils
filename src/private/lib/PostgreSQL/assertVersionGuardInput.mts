import { VERSION_GUARD_FIELDS } from '@lib/PostgreSQL/guard/VERSION_GUARD_FIELDS.mjs'

/** The shape checks of `guardVersion`, in the order field, expected, entity. Each is a `TypeError`; no statement ran before them. */
export function assertVersionGuardInput(input: {
	readonly field: string
	readonly expected: number
	readonly entity: string
}): void {
	if (!(VERSION_GUARD_FIELDS as readonly string[]).includes(input.field)) {
		throw new TypeError(`field must be one of ${VERSION_GUARD_FIELDS.join(', ')}`)
	}
	if (!Number.isSafeInteger(input.expected)) {
		throw new TypeError('expected must be a whole number')
	}
	if (typeof input.entity !== 'string' || input.entity === '') {
		throw new TypeError('entity must be a non-empty string')
	}
}
