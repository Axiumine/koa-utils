import type { ISocketLabsClient } from './ISocketLabsClient.mjs'

/* eslint-disable sonarjs/no-redundant-optional -- under exactOptionalPropertyTypes `?: T` rejects an explicit `undefined`, so `| undefined` is what lets a caller pass `{ onError: maybeOnError }` */

/**
 * Options of {@link createSocketLabsSender}. Nothing is read from the environment: you pass the credentials.
 * There is no `endpointUrl` and no proxy option on purpose, so the sender can only talk to the SocketLabs Injection API.
 */
export interface ISocketLabsSenderOptions {
	/** SocketLabs server id. Not validated here. Ignored when `client` is given. */
	serverId: number
	/** SocketLabs injection API key. Not validated here, never put in an error text. Ignored when `client` is given. */
	apiKey: string
	/**
	 * Timeout of one HTTP request, in seconds, counted from the start of the request to the last byte of the answer. Default 120.
	 * Must be finite and above 0, else `RangeError` when the sender is created. Unused when `client` is given.
	 */
	requestTimeout?: number | undefined
	/**
	 * How many times the client retries a failed request: a timeout, or a 429, 500, 502, 503 or 504 answer (`Retry-After` is not read). Default 3. Must be an
	 * integer from 0 to 5, else `RangeError` when the sender is created. Unused when `client` is given. Retries add to the time
	 * one send can take (up to `requestTimeout` x (1 + `numberOfRetries`) plus a back-off of 1 to 10 s before each retry), and a
	 * retry after a timeout can deliver the mail twice.
	 */
	numberOfRetries?: number | undefined
	/** Use this client instead of the built-in one. For tests and for a client you configure yourself. */
	client?: ISocketLabsClient | undefined
	/**
	 * Called with the raw rejection of a failed send, before the sender resolves to `{ ok: false, code }`. Default: nothing.
	 * The value is whatever the client rejected with (the built-in client rejects with an `Error` that carries a `result`; another client may reject with a `SendResponse`, a `TypeError`, a string, `null`) and can
	 * hold recipients and a transaction receipt: do not log or serialise it as is. A throw from here rejects the sender's promise.
	 */
	onError?: ((rejection: unknown) => void) | undefined
}

/* eslint-enable sonarjs/no-redundant-optional -- end of the exactOptionalPropertyTypes block above */
