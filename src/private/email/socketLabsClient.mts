import type { ISocketLabsClient } from '@email/ISocketLabsClient.mjs'
import { sleepMs } from '@lib/sleepMs.mjs'

import type { ISocketLabsBasicMessage } from './ISocketLabsBasicMessage.mjs'
import type { ISocketLabsOutcome } from './ISocketLabsOutcome.mjs'
import { buildInjectionRequest, credentialsOutcome, type IInjectionRequest, messageOutcome } from './socketLabsRequest.mjs'
import { parseInjectionResponse } from './socketLabsResponse.mjs'
import { SocketLabsSendError } from './SocketLabsSendError.mjs'

/** The SocketLabs Injection API, the only host the client talks to. Fixed: nothing a caller passes can change it. */
const INJECTION_ENDPOINT = 'https://inject.socketlabs.com/api/v1/email'
/** The statuses the SDK retried, besides a timeout. Not 429, not any 4xx, and not a network error: the SDK never retried those. */
const RETRY_STATUSES: ReadonlySet<number> = new Set([500, 502, 503, 504])
const BACKOFF_MIN_MS = 1000
const BACKOFF_MAX_MS = 10_000
/** Longest delay a Node timer can hold: a larger one makes it fire after 1 ms. */
const MAX_TIMEOUT_MS = 2_147_483_647

export interface ISocketLabsClientOptions {
	serverId: number
	apiKey: string
	/** Seconds one request may take, from the start of the call to the last byte of the answer. Finite and above 0. */
	requestTimeout: number
	/** Retries after the first attempt, from 0 to 5. */
	numberOfRetries: number
	/** Tests only: where to post. The sender never passes it, so the endpoint cannot be changed from outside. */
	endpointUrl?: string
	/** Tests only: the wait between attempts. */
	sleep?: (ms: number) => Promise<unknown>
	/** Tests only: the randomness of the back-off, a function returning a number from 0 up to 1. */
	random?: () => number
}

/** One try: the answer, a timeout, or any other failure of the request (no connection, a reset, a redirect, a bad header). */
type TAttempt = { kind: 'http'; status: number; text: string } | { kind: 'timeout' } | { kind: 'network' }

/**
 * The wait before retry number `retry` (0 for the first), the SDK's `promise-retry` setting: `minTimeout` 1000, factor 2,
 * randomised by a factor from 1 up to 2, `maxTimeout` 10000. So 1-2 s, 2-4 s, 4-8 s, 8-10 s, then 10 s.
 */
export function backoffMs(retry: number, random: () => number): number {
	return Math.min((random() + 1) * BACKOFF_MIN_MS * 2 ** retry, BACKOFF_MAX_MS)
}

async function post(url: string, request: IInjectionRequest, timeoutMs: number): Promise<TAttempt> {
	const signal = AbortSignal.timeout(timeoutMs)
	try {
		// redirect 'error': the key and the mail go to the endpoint above and nowhere else
		const response = await fetch(url, {
			method: 'POST',
			headers: request.headers,
			body: request.body,
			signal,
			redirect: 'error'
		})
		return { kind: 'http', status: response.status, text: await response.text() }
	} catch {
		// The error itself is dropped on purpose: it comes from the HTTP stack and nothing in it is worth the risk of carrying a header value
		return signal.aborted ? { kind: 'timeout' } : { kind: 'network' }
	}
}

const isRetryable = (attempt: TAttempt): boolean =>
	attempt.kind === 'timeout' || (attempt.kind === 'http' && RETRY_STATUSES.has(attempt.status))

function outcomeOf(attempt: TAttempt): ISocketLabsOutcome {
	if (attempt.kind === 'timeout') {
		return { name: 'Timeout' }
	}
	return attempt.kind === 'network' ? {} : parseInjectionResponse(attempt.status, attempt.text)
}

/**
 * A client for the SocketLabs Injection API built on `fetch`, replacing the `@socketlabs/email` SDK. `send` takes the message
 * `buildBasicMessage` makes and resolves with the outcome when SocketLabs accepted it. Every failure rejects with a
 * `SocketLabsSendError` whose `result.name` is the code `createSocketLabsSender` reports; a failure that cannot be classified has no `result`.
 */
export function createSocketLabsClient(options: ISocketLabsClientOptions): ISocketLabsClient {
	const { serverId, apiKey, numberOfRetries } = options
	const url = options.endpointUrl ?? INJECTION_ENDPOINT
	const sleep = options.sleep ?? sleepMs
	const random = options.random ?? Math.random
	const timeoutMs = Math.min(Math.ceil(options.requestTimeout * 1000), MAX_TIMEOUT_MS)

	return {
		async send(message: ISocketLabsBasicMessage): Promise<ISocketLabsOutcome> {
			const invalid = credentialsOutcome(serverId, apiKey) ?? messageOutcome(message)
			if (invalid) {
				throw new SocketLabsSendError(invalid)
			}
			const request = buildInjectionRequest(serverId, apiKey, message)
			let attempt = await post(url, request, timeoutMs)
			for (let retry = 0; retry < numberOfRetries && isRetryable(attempt); retry++) {
				await sleep(backoffMs(retry, random))
				attempt = await post(url, request, timeoutMs)
			}
			const outcome = outcomeOf(attempt)
			if (outcome.name === 'Success') {
				return outcome
			}
			throw new SocketLabsSendError(outcome)
		}
	}
}
