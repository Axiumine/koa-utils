import { SocketLabsLib } from '@email/SocketLabsLib.mjs'

/**
 * The one message the password-reset flow sends.
 *
 * A single-method interface looks like ceremony next to `IVerifyEmailMailer`'s six, and it is not: the
 * link in this mail carries the host the account will finish the reset on, and the resolver that sends it
 * has no way to know which of a deployment's front ends the account belongs to. Before this seam existed
 * the host was `APP_DOMAIN`, read once in `SocketLabsLib`'s constructor — correct for a deployment with
 * one front end, and wrong the moment a second one authenticates against the same backend, because every
 * customer's reset link then points at the operator panel.
 *
 * Structural, so `SocketLabsLib` itself satisfies it and a test double is an object literal.
 *
 * The resolver never awaits the returned promise (see `createResetPwdMutation` for the three reasons), so
 * an implementation must not rely on its rejection being observed by the caller — the flow attaches its
 * own Sentry handler and nothing else looks at it.
 */
export interface IResetPwdMailer {
	sendEmailReset(email: string, hash: string, name: string): Promise<unknown>
}

/**
 * SocketLabs on the default link base, constructed per call.
 *
 * Per call rather than once at module load for the reason `socketLabsVerifyEmailMailer` gives: the
 * constructor reads `process.env`, and hoisting it to import time pins whatever the environment held when
 * the module was first resolved.
 */
export const socketLabsResetPwdMailer: IResetPwdMailer = {
	sendEmailReset: (email, hash, name) => new SocketLabsLib().sendEmailReset(email, hash, name)
}

/**
 * A mailer that points the reset link at a specific host and route.
 *
 * The intended use is one call per audience: a deployment serving a customer site next to an operator
 * panel builds one of these per front end and passes it to that tier's `createResetPwdFlow`. Both
 * arguments are configuration rather than a pre-joined URL — `sendEmailReset` normalises a trailing slash
 * on the base and a missing leading slash on the path.
 *
 * Both are optional so a caller can pass `process.env.SOMETHING` straight through: an unset variable
 * arrives as `undefined` and the default takes over — `APP_DOMAIN` for the base, `/x/reset` for the path.
 * Normalising that to `''` at the call site instead would produce a link with no host at all.
 *
 * ⚠️ `linkPath` names a **front-end route**, not a backend mount. It has to match the route that renders
 * the new-password form in the app `linkBase` serves; there is nothing on the server side that would fail
 * loudly if it does not, because the link is only ever followed by a person.
 */
export const createResetPwdMailer = (linkBase?: string, linkPath?: string): IResetPwdMailer => ({
	sendEmailReset: (email, hash, name) => new SocketLabsLib().sendEmailReset(email, hash, name, linkBase, linkPath)
})
