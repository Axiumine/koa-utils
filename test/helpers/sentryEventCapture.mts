import * as Sentry from '@sentry/node'

// Sentry ESM ns sealed → no stub. Real NodeClient on current scope, fake transport, beforeSend drop → event captured, nothing sent.
// startSentryCapture() before act, await stop() in finally → scope client restored.

type CapturedSentryEvent = {
	message?: string
	level?: string
	extra?: Record<string, unknown>
	exception?: { values?: Array<{ type?: string; value?: string }> }
}

export const startSentryCapture = () => {
	const events: Array<CapturedSentryEvent> = []
	const scope = Sentry.getCurrentScope()
	const previous = scope.getClient()
	const client = new Sentry.NodeClient({
		dsn: 'https://public@example.invalid/1',
		integrations: [],
		stackParser: Sentry.defaultStackParser,
		transport: () => ({ send: async () => ({}), flush: async () => true }),
		beforeSend: (event) => {
			events.push(event as CapturedSentryEvent)
			return null
		}
	})
	scope.setClient(client)
	client.init()

	return {
		events,
		// flush → async event pipeline done before assert
		stop: async () => {
			await client.flush(2000)
			scope.setClient(previous)
		}
	}
}
