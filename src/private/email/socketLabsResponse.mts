import type { ISocketLabsOutcome } from './ISocketLabsOutcome.mjs'
import { withDefined } from './withDefined.mjs'

/** The `ErrorCode` values the Injection API can send, as named in the SocketLabs SDK's result enum. Any other string is not classified. */
const API_CODES: ReadonlySet<string> = new Set(
	(
		'Success Warning InternalError MessageTooLarge TooManyRecipients InvalidData OverQuota TooManyErrors InvalidAuthentication ' +
		'AccountDisabled TooManyMessages NoValidRecipients InvalidAddress InvalidAttachment NoMessages EmptyMessage EmptySubject ' +
		'InvalidFrom EmptyToAddress NoValidBodyParts InvalidTemplateId TemplateHasNoContent MessageBodyConflict InvalidMergeData ' +
		'MetadataOrTagsAreTooLarge'
	).split(' ')
)

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** The code when it is a string the API is known to send, else `undefined`. A lookup in a set, so `'constructor'` is not a code. */
const apiCode = (value: unknown): string | undefined => (typeof value === 'string' && API_CODES.has(value) ? value : undefined)

const receiptOf = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined)

const firstMessageResult = (messageResults: unknown): Record<string, unknown> | undefined => {
	const first: unknown = Array.isArray(messageResults) ? messageResults[0] : undefined
	return isRecord(first) ? first : undefined
}

/**
 * Reads the answer of the Injection API, the way the SDK's `SendResponse.parse` does for a response axios let through.
 *
 * Only a `200` is read. Any other status gives an outcome with no name: the SDK looked the status up in a result enum
 * that has no numeric keys, so a `401`, a `500` and a `408` all arrived unclassified. On a `200` the `ErrorCode` of the
 * body names the result; a `Warning` takes the `ErrorCode` of the first message result when that one is known, which
 * is how a rejected recipient shows up. The transaction receipt and the address results ride along for `onError`.
 */
export function parseInjectionResponse(status: number, text: string): ISocketLabsOutcome {
	if (status !== 200) {
		return {}
	}
	let body: unknown
	try {
		body = JSON.parse(text)
	} catch {
		return { name: 'UnknownError' }
	}
	if (!isRecord(body)) {
		return {}
	}
	const first = firstMessageResult(body['MessageResults'])
	let name = apiCode(body['ErrorCode'])
	if (name === 'Warning' && first) {
		name = apiCode(first['ErrorCode']) ?? name
	}
	const addressResults = first?.['AddressResults']
	return withDefined({
		name,
		transactionReceipt: receiptOf(body['TransactionReceipt']),
		addressResults: Array.isArray(addressResults) ? addressResults.filter(isRecord) : undefined
	})
}
