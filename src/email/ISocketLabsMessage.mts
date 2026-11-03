/* eslint-disable sonarjs/no-redundant-optional -- under exactOptionalPropertyTypes `?: T` rejects an explicit `undefined`, so `| undefined` is what lets a caller pass `{ text: maybeText }` */

/**
 * One mail handed to the function that {@link createSocketLabsSender} returns. A single recipient, no attachments,
 * no copies. `text` and `html` are both optional here, but the SDK rejects a message with neither (`MessageValidationEmptyMessage`).
 */
export interface ISocketLabsMessage {
	/** Sender address. */
	from: string
	/** Display name shown next to `from`. Omitted: the address alone. */
	fromName?: string | undefined
	/** Recipient address. */
	to: string
	/** Subject line, raw text. */
	subject: string
	/** Plain-text body. */
	text?: string | undefined
	/** HTML body, sent as given: no header, footer or escaping is added. */
	html?: string | undefined
	/** Your own message id, sent as the SocketLabs `MessageId`. Omitted: none is sent. */
	messageId?: string | undefined
}

/* eslint-enable sonarjs/no-redundant-optional -- end of the exactOptionalPropertyTypes block above */
