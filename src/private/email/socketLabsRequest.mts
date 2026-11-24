import type { ISocketLabsAddress, ISocketLabsBasicMessage } from './ISocketLabsBasicMessage.mjs'
import type { ISocketLabsOutcome } from './ISocketLabsOutcome.mjs'

/** Longest address the SDK accepts, in characters. */
const MAX_ADDRESS_LENGTH = 320
/** A key of the form `<20 characters>.<40 characters>` is sent as a bearer token; any other key goes in the body. */
const STRUCTURED_KEY_LENGTH = 61
const STRUCTURED_KEY_SEPARATOR_AT = 20

const USER_AGENT = `@axiumine/koa-utils (nodejs ${process.version})`

/** The same checks as the SDK's `EmailAddress.isValid`: one `@` with something on both sides, none of `,` `;` or a space. */
function isValidAddress(address: string | undefined): boolean {
	if (address === undefined || address.length > MAX_ADDRESS_LENGTH) {
		return false
	}
	const parts = address.split('@')
	return parts.length === 2 && parts.every((part) => part.trim().length > 0) && !/[ ,;]/.test(address)
}

/** `undefined` when `serverId` is a positive integer and `apiKey` a non-empty string, else the SDK's `AuthenticationValidationFailed`. */
export function credentialsOutcome(serverId: unknown, apiKey: unknown): ISocketLabsOutcome | undefined {
	const valid =
		typeof apiKey === 'string' && apiKey !== '' && typeof serverId === 'number' && Number.isInteger(serverId) && serverId > 0
	return valid ? undefined : { name: 'AuthenticationValidationFailed' }
}

/**
 * `undefined` when the message can be sent, else the outcome the SDK's validator gave, checked in its order: subject, from
 * address, body, recipients. Nothing is sent for a message that fails here.
 */
export function messageOutcome(message: ISocketLabsBasicMessage): ISocketLabsOutcome | undefined {
	const { from, to } = message
	if (!message.subject) {
		return { name: 'MessageValidationEmptySubject' }
	}
	if (!from.emailAddress) {
		return { name: 'EmailAddressValidationMissingFrom' }
	}
	if (!isValidAddress(from.emailAddress)) {
		return { name: 'EmailAddressValidationInvalidFrom' }
	}
	if (!message.htmlBody && !message.textBody) {
		return { name: 'MessageValidationEmptyMessage' }
	}
	if (to.length === 0) {
		return { name: 'RecipientValidationNoneInMessage' }
	}
	const invalid = to.filter((address) => !isValidAddress(address.emailAddress))
	if (invalid.length > 0) {
		return {
			name: 'RecipientValidationInvalidRecipients',
			addressResults: invalid.map((address) => ({
				emailAddress: address.emailAddress,
				accepted: false,
				errorCode: 'InvalidAddress'
			}))
		}
	}
	return undefined
}

// `undefined` values drop out of JSON.stringify, which leaves the keys of the SDK's `BasicMessage.toJSON`, in its order
const addressJson = ({ emailAddress, friendlyName }: ISocketLabsAddress) => ({ emailAddress, friendlyName })

/** One message as the Injection API takes it. */
function messageJson(message: ISocketLabsBasicMessage) {
	return {
		subject: message.subject,
		htmlBody: message.htmlBody,
		textBody: message.textBody,
		messageId: message.messageId,
		from: addressJson(message.from),
		to: message.to.map(addressJson)
	}
}

const isStructuredApiKey = (apiKey: string): boolean =>
	apiKey.length === STRUCTURED_KEY_LENGTH && apiKey.indexOf('.') === STRUCTURED_KEY_SEPARATOR_AT

export interface IInjectionRequest {
	headers: Record<string, string>
	body: string
}

/**
 * What the SDK's `createRequest` sends. A key of the form `<20>.<40>` travels as `Authorization: Bearer <key>` and stays out of
 * the body; any other key travels as `apiKey` in the body and there is no `Authorization` header. The body is
 * `{ serverId, messages: [message] }`. The key is never put anywhere else.
 */
export function buildInjectionRequest(serverId: number, apiKey: string, message: ISocketLabsBasicMessage): IInjectionRequest {
	const bearer = isStructuredApiKey(apiKey)
	const headers: Record<string, string> = {
		'Content-Type': 'application/json;charset=utf-8',
		Accept: 'application/json',
		'User-Agent': USER_AGENT
	}
	if (bearer) {
		headers['Authorization'] = `Bearer ${apiKey}`
	}
	const messages = [messageJson(message)]
	return { headers, body: JSON.stringify(bearer ? { serverId, messages } : { apiKey, serverId, messages }) }
}
