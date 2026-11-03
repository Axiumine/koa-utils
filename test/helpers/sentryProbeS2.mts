/**
 * Sentry probe — observe `Sentry.captureException` / `captureMessage` without stubbing.
 *
 * `@sentry/node` = sealed ESM namespace → sinon refuse. Real client instead: `Sentry.init` with
 * `beforeSend` returning null → event recorded in-memory, never leave process. No DSN network, no
 * default integrations (no global process handlers), no OpenTelemetry setup → safe inside mocha.
 *
 * Usage: `const probe = await startSentryProbe()` in `beforeEach`, `await probe.stop()` in `afterEach`.
 * Capture is async inside client → `await probe.flush()` before reading `probe.events`.
 */
import * as Sentry from '@sentry/node'

export interface ISentryProbe {
	/** Events seen since `startSentryProbe`, in capture order. */
	readonly events: Sentry.Event[]
	/** Wait until the client finished processing every capture call made so far. */
	flush(): Promise<void>
	/** Messages of captured exceptions + captured plain messages, in order. */
	texts(): string[]
	/** Close client → later `Sentry.capture*` calls are no-op again (state before the probe). */
	stop(): Promise<void>
}

export async function startSentryProbe(): Promise<ISentryProbe> {
	const events: Sentry.Event[] = []
	Sentry.init({
		dsn: 'https://public@sentry-probe.invalid/1',
		defaultIntegrations: false,
		integrations: [],
		skipOpenTelemetrySetup: true,
		beforeSend(event) {
			events.push(event)
			return null
		}
	})

	return {
		events,
		async flush() {
			await Sentry.flush(2000)
		},
		texts() {
			return events.map((e) => e.exception?.values?.[0]?.value ?? e.message ?? '')
		},
		async stop() {
			await Sentry.close(2000)
		}
	}
}
