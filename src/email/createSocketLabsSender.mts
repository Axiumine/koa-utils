import { createSocketLabsClient } from '@private/email/socketLabsClient.mjs'
import { buildBasicMessage } from '@private/email/socketLabsMessage.mjs'

import type { ISocketLabsClient } from './ISocketLabsClient.mjs'
import type { ISocketLabsMessage } from './ISocketLabsMessage.mjs'
import type { ISocketLabsSenderOptions } from './ISocketLabsSenderOptions.mjs'
import type { ISocketLabsSendResult } from './ISocketLabsSendResult.mjs'

/** Seconds, what `SocketLabsLib` has always passed. */
const DEFAULT_REQUEST_TIMEOUT = 120
/** What `SocketLabsLib` has always passed. */
const DEFAULT_NUMBER_OF_RETRIES = 3
/** Upper bound of `numberOfRetries`: every retry can run a full timeout, so a larger value outlives any sane job lease. */
const MAX_NUMBER_OF_RETRIES = 5
/** The name a failure gets when nothing classifies it: the name the SocketLabs SDK's result enum gave it. */
const UNKNOWN_ERROR = 'UnknownError'

/** What `codeOf` reads off a rejection. A string, a number, `null` or `undefined` has no `result`. */
type TRejectionLike = { result?: { name?: unknown } | null } | null | undefined

// Messages name the constraint, never the value: the options object also holds the API key
function assertRequestTimeout(requestTimeout: number): void {
	if (!Number.isFinite(requestTimeout) || requestTimeout <= 0) {
		throw new RangeError('requestTimeout must be a finite number of seconds above 0')
	}
}

function assertNumberOfRetries(numberOfRetries: number): void {
	if (!Number.isInteger(numberOfRetries) || numberOfRetries < 0 || numberOfRetries > MAX_NUMBER_OF_RETRIES) {
		throw new RangeError(`numberOfRetries must be an integer from 0 to ${MAX_NUMBER_OF_RETRIES}`)
	}
}

/** `rejection.result.name` when it is a string, else `'UnknownError'`. The built-in client rejects with an error whose `result` holds the name. */
const codeOf = (rejection: unknown): string => {
	const name = (rejection as TRejectionLike)?.result?.name
	return typeof name === 'string' ? name : UNKNOWN_ERROR
}

/**
 * Builds a function that sends one mail through SocketLabs and reports the outcome as a value.
 *
 * The returned function builds the message (`buildBasicMessage`: the fields of the SocketLabs SDK's `BasicMessage`) and passes
 * it to the client. On success it resolves to `{ ok: true }`. When the client rejects it calls `onError` with the raw
 * rejection and resolves to `{ ok: false, code }`, where `code` is `rejection.result.name` if that is a string and
 * `'UnknownError'` otherwise.
 *
 * There is no `try`/`catch`: a throw from the message builder (a field that is not a string), from `client.send` itself,
 * and from `onError`, reject the returned promise, and when the builder throws `client.send` is never called.
 *
 * The built-in client posts with `fetch` to the SocketLabs Injection API and nothing else; it needs no package. The sender reads no
 * environment variable and checks nothing about `serverId` and `apiKey` when it is created: a bad pair is rejected at
 * send time and comes back as a code. Importing it loads no peer: no Sentry, no dotenv.
 *
 * @throws RangeError `requestTimeout` is not a finite number above 0, or `numberOfRetries` is not an integer from 0 to 5. The text never holds the API key.
 */
export function createSocketLabsSender(
	options: ISocketLabsSenderOptions
): (message: ISocketLabsMessage) => Promise<ISocketLabsSendResult> {
	const requestTimeout = options.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT
	const numberOfRetries = options.numberOfRetries ?? DEFAULT_NUMBER_OF_RETRIES
	assertRequestTimeout(requestTimeout)
	assertNumberOfRetries(numberOfRetries)

	const client: ISocketLabsClient =
		options.client ??
		createSocketLabsClient({ serverId: options.serverId, apiKey: options.apiKey, requestTimeout, numberOfRetries })
	const { onError } = options

	return async function sendSocketLabsMessage(message) {
		const basicMessage = buildBasicMessage(message)

		return client.send(basicMessage).then(
			(): ISocketLabsSendResult => ({ ok: true }),
			(rejection: unknown): ISocketLabsSendResult => {
				onError?.(rejection)
				return { ok: false, code: codeOf(rejection) }
			}
		)
	}
}
