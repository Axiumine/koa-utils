/**
 * One outgoing message as the three strings `SocketLabsLib` hands to SocketLabs. `subject` and `textBody` carry
 * the raw values; every value interpolated into `htmlBody` has already been escaped for its HTML context.
 */
export interface IEmailContent {
	subject: string
	textBody: string
	htmlBody: string
}
