import { Model } from 'mongoose'

/**
 * Any mongoose model an access flow can be pointed at.
 *
 * Deliberately `Model<any>`: the flows only ever call `findOne`, `updateOne`, `countDocuments` and
 * `deleteOne` with computed field paths, so nothing here can be typed against a concrete document
 * shape without forcing every consumer to describe theirs. The `paths` map below is what pins the
 * contract instead — a wrong path is a runtime no-op, which is why the defaults are exported and the
 * flows are tested against them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TAccessModel = Model<any>

/**
 * Field paths the password-reset flow reads and writes.
 *
 * Every value is a dotted mongo path into the account document. They are supplied as data rather
 * than hard-coded because `UserBase` is only one possible layout: a consumer whose accounts live in
 * another collection, or under another field tree, could not use `resetPwd` / `updatePassword` at
 * all while the paths were baked in.
 */
export interface IResetPwdPaths {
	/** Login address. Used as the lookup filter by `getResetPwd` and `removeResetReq`. */
	email: string
	/** Bcrypt hash slot `updatePassword` overwrites. */
	password: string
	/** Display name passed to the reset / confirmation emails. Missing value ⇒ empty string. */
	name: string
	/** When the pending reset was requested. Drives the 10-minute throttle and the 60-minute expiry. */
	resetDateReq: string
	/** Password-reset token. Must stay disjoint from the email-verification hash slot. */
	resetHash: string
	/** Account tombstone flag. A set value makes `getResetPwd` answer `null`, as for an unknown address. */
	deleted: string
	/** Account lockout flag. A set value makes `getResetPwd` answer `null`, as for an unknown address. */
	disabled: string
	/**
	 * Paths `removeResetReq` `$unset`s once a reset has been consumed.
	 *
	 * Kept separate from `resetDateReq` / `resetHash` on purpose — it is NOT always the same list.
	 * A layout that stores the request as one all-or-nothing subdocument, e.g.
	 * `resetPwd: { resetDateReq, resetHash }` under `validationLevel: 'strict'` +
	 * `validationAction: 'error'`, rejects a write that unsets a single member: the leftover document
	 * fails validation. The only legal cleanup there is `$unset: { resetPwd: '' }` — one container
	 * path, not two leaf paths. Deriving this list from the leaves would make that layout impossible
	 * to express, and the flat default hides the problem completely.
	 */
	resetClear: readonly string[]
}

/** The layout of `UserBase` — i.e. the behaviour of the flow before it took a `paths` map. */
export const DEFAULT_RESET_PWD_PATHS: IResetPwdPaths = Object.freeze({
	email: 'login.email',
	password: 'login.password',
	name: 'personalData.name',
	resetDateReq: 'account.resetDateReq',
	resetHash: 'account.resetHash',
	deleted: 'account.deleted',
	disabled: 'account.disabled',
	resetClear: Object.freeze(['account.resetDateReq', 'account.resetHash'])
})

/**
 * Merge a partial override over {@link DEFAULT_RESET_PWD_PATHS}.
 *
 * Plain spread: a key present with an explicit `undefined` value overrides the default with
 * `undefined`, so pass only the keys being changed.
 */
export function resolveResetPwdPaths(paths?: Partial<IResetPwdPaths>): IResetPwdPaths {
	return { ...DEFAULT_RESET_PWD_PATHS, ...paths }
}

/**
 * Field paths the email-verification and email-change flows read and write.
 *
 * Same rationale as {@link IResetPwdPaths}. Note that `hash` here is the inbox-proof token
 * (activation and email change, 3-day life, `requestTimes` throttle) and must never be pointed at
 * the same field as `IResetPwdPaths.resetHash`: while the two shared one slot, a hash issued by
 * either flow authenticated the other, and an unauthenticated reset request killed pending
 * activation links.
 */
export interface IVerifyEmailPaths {
	/** Live login address — lookup filter, and the field `confirmNewEmail` writes on an email change. */
	email: string
	/** Boolean flag `enableEmailAccess` flips once a verification link is honoured. */
	valid: string
	/** Verification / email-change token. Never the password-reset slot. */
	hash: string
	/** When the current token was issued. Drives the 3-day link window. */
	dateLastReq: string
	/** Strike counter. Five wrong hashes delete the account. */
	requestTimes: string
	/** Address awaiting confirmation during an email change. */
	newEmailTmp: string
	/** Account tombstone flag. */
	deleted: string
	/** Account lockout flag. */
	disabled: string
	/** Paths `enableEmailAccess` `$unset`s once a verification link is honoured. */
	verifyClear: readonly string[]
	/** Paths `confirmNewEmail` `$unset`s once a new address is accepted. */
	emailChangeClear: readonly string[]
}

/** The layout of `UserBase` — i.e. the behaviour of the flow before it took a `paths` map. */
export const DEFAULT_VERIFY_EMAIL_PATHS: IVerifyEmailPaths = Object.freeze({
	email: 'login.email',
	valid: 'account.email.valid',
	hash: 'account.email.hash',
	dateLastReq: 'account.email.dateLastReq',
	requestTimes: 'account.email.requestTimes',
	newEmailTmp: 'account.email.newEmailTmp',
	deleted: 'account.deleted',
	disabled: 'account.disabled',
	verifyClear: Object.freeze(['account.email.hash', 'account.email.dateLastReq', 'account.email.requestTimes']),
	emailChangeClear: Object.freeze([
		'account.email.hash',
		'account.email.dateLastReq',
		'account.email.requestTimes',
		'account.email.newEmailTmp'
	])
})

/**
 * Merge a partial override over {@link DEFAULT_VERIFY_EMAIL_PATHS}.
 *
 * Plain spread: a key present with an explicit `undefined` value overrides the default with
 * `undefined`, so pass only the keys being changed.
 */
export function resolveVerifyEmailPaths(paths?: Partial<IVerifyEmailPaths>): IVerifyEmailPaths {
	return { ...DEFAULT_VERIFY_EMAIL_PATHS, ...paths }
}
