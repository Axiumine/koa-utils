import type { captureException, captureMessage, Scope } from '@sentry/node'

/**
 * The three Sentry calls this package makes, with the signatures of `@sentry/node`. The real module satisfies it as is
 * (its `withScope` has a second overload this package never uses); the no-op client in `createSentryClient` too.
 */
export interface ISentryClient {
	captureException: typeof captureException
	captureMessage: typeof captureMessage
	withScope: <T>(callback: (scope: Scope) => T) => T
}
