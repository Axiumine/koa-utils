import type { ISocketLabsMessage } from '@email/ISocketLabsMessage.mjs'

import type { ISocketLabsBasicMessage } from './ISocketLabsBasicMessage.mjs'
import { withDefined } from './withDefined.mjs'

/**
 * An absent value (`undefined`, `null`, `''`, `0`, `false`) gives `undefined`, a string gives itself and anything else
 * throws. The text names the field, never the value.
 */
function asText(value: unknown, label: string): string | undefined {
	if (!value) {
		return undefined
	}
	if (typeof value !== 'string') {
		throw new TypeError(`Invalid ${label}, type of 'string' was expected.`)
	}
	return value
}

/**
 * Turns what the caller of `createSocketLabsSender` passes into the message `client.send` receives. Fields are read in the
 * order from, from name, subject, text, html, to, message id, so when two are wrong the first of them is the one reported.
 *
 * @throws TypeError a field that is set but is not a string.
 */
export function buildBasicMessage(message: ISocketLabsMessage): ISocketLabsBasicMessage {
	const emailAddress = asText(message.from, 'from address')
	const friendlyName = asText(message.fromName, 'from name')
	const subject = asText(message.subject, 'subject')
	const textBody = asText(message.text, 'text body')
	const htmlBody = asText(message.html, 'html body')
	const recipient = asText(message.to, 'to address')
	const messageId = asText(message.messageId, 'message id')
	return {
		messageType: 'basic',
		from: withDefined({ emailAddress, friendlyName }),
		to: recipient === undefined ? [] : [{ emailAddress: recipient }],
		...withDefined({ subject, textBody, htmlBody, messageId })
	}
}
