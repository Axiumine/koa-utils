import type { ISentryClient } from '@private/lib/ISentryClient.mjs'
import type { Scope } from '@sentry/node'

// A scope whose every method is a chainable no-op, like the real setters (`scope.setTag(...).setLevel(...)`).
// `then` is left undefined: a callback that returns the scope from an async function would otherwise treat it as a
// thenable and wait forever.
const noopSetter = (): Scope => NOOP_SCOPE
const NOOP_SCOPE: Scope = new Proxy({} as Scope, { get: (_target, property) => (property === 'then' ? undefined : noopSetter) })

// What the package reports to when `@sentry/node` is not installed: nothing. The event id is '' as no event exists.
const NOOP_CLIENT: ISentryClient = {
	captureException: () => '',
	captureMessage: () => '',
	withScope: (callback) => callback(NOOP_SCOPE)
}

/**
 * The Sentry client of this package: the SDK itself when it is installed, no-ops when it is not.
 *
 * @param sdk the `@sentry/node` module, or `null` when it is not installed
 */
export function createSentryClient(sdk: ISentryClient | null): ISentryClient {
	return sdk ?? NOOP_CLIENT
}
