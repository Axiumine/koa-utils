import type { IRoleAssertionReason } from './IRoleAssertionReason.mjs'
import type { IRoleAssertionSubject } from './IRoleAssertionSubject.mjs'

/** A short code that is safe to keep: letters, digits and underscore, at most 32 characters. */
const SAFE_CODE = /^\w{1,32}$/

/** Text that is safe to put in a message: a name of letters, digits, `_`, `$` and `.`, never a URL or a sentence. */
const PRINTABLE_NAME = /^[A-Za-z_][\w$.]{0,126}$/

/** The text itself when it is a plain name, otherwise `?`. Anything that is not a string is `?` too. */
function printable(value: unknown): string {
	return typeof value === 'string' && PRINTABLE_NAME.test(value) ? value : '?'
}

/** The subject with every name passed through {@link printable} and a code kept only when it is a short code. */
function safeSubject(subject: IRoleAssertionSubject): IRoleAssertionSubject {
	return {
		...(subject.object === undefined ? {} : { object: printable(subject.object) }),
		...(subject.privilege === undefined ? {} : { privilege: printable(subject.privilege) }),
		...(subject.column === undefined ? {} : { column: printable(subject.column) }),
		...(subject.code !== undefined && SAFE_CODE.test(subject.code) ? { code: subject.code } : {})
	}
}

/** The part of the message after the reason: what is missing, or whose member the role is, or the code. */
function subjectText(reason: IRoleAssertionReason, subject: IRoleAssertionSubject): string {
	if (reason === 'GRANT_MISSING') {
		const column = subject.column === undefined ? '' : ` column ${subject.column}`
		return ` (${subject.privilege ?? '?'} on ${subject.object ?? '?'}${column})`
	}
	if (reason === 'ROLE_MEMBERSHIP') return ` (member of ${subject.object ?? '?'})`
	if (reason === 'CHECK_FAILED' && subject.code !== undefined) return ` (${subject.code})`
	return ''
}

/**
 * The typed error of `assertRole`. The message is built from the role name, the closed reason and, for a missing grant,
 * the object and the privilege; each name passes a shape check and a text that fails it prints as `?`, so a connection
 * string given by mistake as a role name is not repeated. The error carries no `cause`: the driver error that led to
 * `CHECK_FAILED` can quote an argument, and is not kept.
 */
export class RoleAssertionError extends Error {
	readonly reason: IRoleAssertionReason
	/** The role the caller expected (`?` when the text given was not a plain name). */
	readonly role: string
	readonly object: string | undefined
	readonly privilege: string | undefined
	readonly column: string | undefined
	/** The driver or SQLSTATE code of a `CHECK_FAILED`, or undefined. Never free text. */
	readonly code: string | undefined

	constructor(reason: IRoleAssertionReason, role: string, subject: IRoleAssertionSubject = {}) {
		const safe = safeSubject(subject)
		const name = printable(role)
		super(`role assertion failed for ${name}: ${reason}${subjectText(reason, safe)}`)
		this.name = 'RoleAssertionError'
		this.reason = reason
		this.role = name
		this.object = safe.object
		this.privilege = safe.privilege
		this.column = safe.column
		this.code = safe.code
	}
}
