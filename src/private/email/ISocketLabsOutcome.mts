/**
 * What a send came to, before it is turned into a resolution or a rejection. `name` is the SocketLabs result name
 * (`'Success'`, `'Timeout'`, `'InvalidAuthentication'`, ...); it is absent when the outcome could not be classified,
 * which the sender reports as `'UnknownError'`.
 */
export interface ISocketLabsOutcome {
	name?: string
	transactionReceipt?: string
	addressResults?: Record<string, unknown>[]
}
