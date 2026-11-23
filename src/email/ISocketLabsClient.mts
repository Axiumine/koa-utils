/**
 * The part of a SocketLabs client that {@link createSocketLabsSender} calls. The client the sender builds fits it, so does
 * the `SocketLabsClient` of the SocketLabs Node SDK if you still use it, and so does a test double such as
 * `{ send: async () => ({}) }`. A client resolves when the mail was accepted and rejects when it was not; the sender turns
 * the rejection into `{ ok: false, code }`. It is declared here so `.d.mts` files that name this interface need no package.
 */
export interface ISocketLabsClient {
	// Method syntax on purpose: method parameters are bivariant, so a double typed with a narrower message still fits.
	send(message: unknown): Promise<unknown>
}
