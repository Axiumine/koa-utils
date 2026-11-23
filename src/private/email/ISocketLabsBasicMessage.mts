/**
 * One address of a message. A key with no value is absent, never `undefined`: that is how the SocketLabs SDK's
 * `EmailAddress` held it, and a client double that checks `'friendlyName' in from` keeps working.
 */
export interface ISocketLabsAddress {
	emailAddress?: string
	friendlyName?: string
}

/**
 * The message `createSocketLabsSender` hands to `client.send`: the data fields of the SDK's `BasicMessage`, with the
 * same names, so a double written against the SDK reads it unchanged and an SDK `SocketLabsClient` can still send it.
 * A field with no value is absent.
 */
export interface ISocketLabsBasicMessage {
	messageType: 'basic'
	from: ISocketLabsAddress
	to: ISocketLabsAddress[]
	subject?: string
	textBody?: string
	htmlBody?: string
	messageId?: string
}
