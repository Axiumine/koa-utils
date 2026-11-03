import { BasicMessage, SocketLabsClient } from '@socketlabs/email'

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
/** The SDK's own name for a rejection it cannot classify (`sendResultEnum.UnknownError`). */
const UNKNOWN_ERROR = 'UnknownError'

/** The `BasicMessage` setters used below. `@socketlabs/email` ships no types, so the shape is declared here. */
interface IBasicMessage {
	setFromAddress(address: string, friendlyName: string | undefined): void
	setSubject(subject: string): void
	setTextBody(text: string | undefined): void
	setHtmlBody(html: string | undefined): void
	setTo(address: string): void
	setMessageId(messageId: string | undefined): void
}

/** The part of the `SocketLabsClient` constructor used below, as declared here for the same reason. */
type TClientConstructor = new (
	serverId: number,
	apiKey: string,
	options: { requestTimeout: number; numberOfRetries: number }
) => ISocketLabsClient

// The import is `any` (src/types/socketlabs-email.d.ts): one assertion each gives the two classes the shapes above
const Message = BasicMessage as new () => IBasicMessage
const Client = SocketLabsClient as TClientConstructor

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

/** `rejection.result.name` when it is a string, else `'UnknownError'`. The SDK rejects with a `SendResponse` whose `result` is one of its enum values. */
const codeOf = (rejection: unknown): string => {
	const name = (rejection as TRejectionLike)?.result?.name
	return typeof name === 'string' ? name : UNKNOWN_ERROR
}

/**
 * Builds a function that sends one mail through SocketLabs and reports the outcome as a value.
 *
 * The returned function builds a `BasicMessage` (setters in the order `setFromAddress`, `setSubject`, `setTextBody`,
 * `setHtmlBody`, `setTo`, `setMessageId`) and passes it to the client. On success it resolves to `{ ok: true }`. When the
 * client rejects it calls `onError` with the raw rejection and resolves to `{ ok: false, code }`, where `code` is
 * `rejection.result.name` if that is a string and `'UnknownError'` otherwise.
 *
 * There is no `try`/`catch`: a throw from a setter or from `client.send` itself, and a throw from `onError`, reject the
 * returned promise, and when a setter throws `client.send` is never called.
 *
 * It reads no environment variable and checks nothing about `serverId` and `apiKey`: the SDK rejects bad credentials
 * at send time. Importing it loads the SocketLabs SDK (the optional peer of this subpath) and nothing else: no Sentry, no dotenv.
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
		options.client ?? new Client(options.serverId, options.apiKey, { requestTimeout, numberOfRetries })
	const { onError } = options

	return async function sendSocketLabsMessage(message) {
		const basicMessage = new Message()
		basicMessage.setFromAddress(message.from, message.fromName)
		basicMessage.setSubject(message.subject)
		basicMessage.setTextBody(message.text)
		basicMessage.setHtmlBody(message.html)
		basicMessage.setTo(message.to)
		basicMessage.setMessageId(message.messageId)

		return client.send(basicMessage).then(
			(): ISocketLabsSendResult => ({ ok: true }),
			(rejection: unknown): ISocketLabsSendResult => {
				onError?.(rejection)
				return { ok: false, code: codeOf(rejection) }
			}
		)
	}
}
