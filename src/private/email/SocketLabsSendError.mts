import type { ISocketLabsOutcome } from './ISocketLabsOutcome.mjs'

const UNKNOWN_ERROR = 'UnknownError'

/**
 * What the built-in client rejects with when a send fails. It has the fields the SocketLabs SDK's `SendResponse` had
 * (`result.name`, `transactionReceipt`, `addressResults`) and is an `Error`, so a report made from it has a stack and a
 * title. The text holds the result name and nothing else: no key, no recipient, no body. `addressResults` can hold
 * recipients and `transactionReceipt` is the server's receipt, so the object is not for logging as it is.
 */
export class SocketLabsSendError extends Error {
	override readonly name = 'SocketLabsSendError'
	/** Absent, as a key, when the failure could not be classified. `declare` so no empty field is emitted. */
	declare readonly result?: { name: string }
	readonly transactionReceipt: string | null
	readonly addressResults: Record<string, unknown>[] | null

	constructor(outcome: ISocketLabsOutcome) {
		super(`SocketLabs send failed: ${outcome.name ?? UNKNOWN_ERROR}`)
		if (outcome.name !== undefined) {
			this.result = { name: outcome.name }
		}
		this.transactionReceipt = outcome.transactionReceipt ?? null
		this.addressResults = outcome.addressResults ?? null
	}
}
