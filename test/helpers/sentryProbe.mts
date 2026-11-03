/**
 * Observe what code under test reports to Sentry.
 *
 * `@sentry/node` = sealed ESM namespace → sinon cannot stub `captureMessage` / `captureException`.
 * Real lib driven instead: `Sentry.init` with fake DSN, no default integrations, no OTel setup,
 * `beforeSend` record each event then return `null` → nothing leave the process.
 *
 * Suite otherwise run with Sentry never init'd (every capture a no-op). Reset in `finally`: re-init
 * without DSN → client disabled → later specs see the no-op again.
 */
import * as Sentry from '@sentry/node'
import type { NodeOptions } from '@sentry/node'

/** The slice of a Sentry event the specs assert on. */
export interface ISentryProbeEvent {
	message: string | undefined
	level: string | undefined
	exceptionMessage: string | undefined
}

const FAKE_DSN = 'https://public@o0.ingest.sentry.io/1'

const baseOptions: NodeOptions = { defaultIntegrations: false, integrations: [], skipOpenTelemetrySetup: true }

/**
 * Run `body` with a recording Sentry client; resolve every event captured meanwhile.
 * `body` rejection propagates after the client is reset.
 */
export async function probeSentry(body: () => Promise<unknown>): Promise<ISentryProbeEvent[]> {
	const events: ISentryProbeEvent[] = []

	// Scope state outlive a spec: `scanVirus` reports through `withScope` + `setLevel('warning')`, and that
	// level stayed on the current scope for later specs → every event of theirs came out 'warning'. Start clean.
	Sentry.getCurrentScope().clear()
	Sentry.getIsolationScope().clear()
	Sentry.getGlobalScope().clear()

	Sentry.init({
		...baseOptions,
		dsn: FAKE_DSN,
		beforeSend(event) {
			events.push({
				message: event.message,
				level: event.level,
				exceptionMessage: event.exception?.values?.[0]?.value
			})
			return null
		}
	})

	try {
		await body()
		await Sentry.flush(2000)
	} finally {
		Sentry.init({ ...baseOptions })
	}

	return events
}
