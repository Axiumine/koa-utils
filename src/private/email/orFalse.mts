import * as Sentry from '@private/lib/sentry.mjs'

/** Run a send; a rejection or a throw becomes a Sentry report and `false`, so the caller never sees it. */
export async function orFalse(send: () => Promise<boolean>): Promise<boolean> {
	try {
		return await send()
	} catch (e) {
		Sentry.captureException(e)
		return false
	}
}
