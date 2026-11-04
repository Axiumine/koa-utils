/**
 * The part of a SocketLabs client that {@link createSocketLabsSender} calls. `SocketLabsClient` fits it, and so does a
 * test double such as `{ send: async () => ({}) }`. It is declared here because the SocketLabs SDK ships no types
 * and this package never imports a type from it, so `.d.mts` files that name this interface need no peer.
 */
export interface ISocketLabsClient {
	// Method syntax on purpose: method parameters are bivariant, so a double typed with a narrower message still fits.
	send(message: unknown): Promise<unknown>
}
