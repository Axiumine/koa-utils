import { EventEmitter } from 'node:events'
import { inspect } from 'node:util'

import type { ITxClient } from '@lib/PostgreSQL/tx/ITxClient.mjs'
import type { ITxPool } from '@lib/PostgreSQL/tx/ITxPool.mjs'

import type { ILogCall } from './recordingLogger.mjs'

// fake pool for withTx specs. No socket, no server. Follow part of node-postgres contract withTx touch:
// pool.connect() → client. client: query(text, values?), on/removeListener for 'error', release(destroy?).
// EventEmitter → 'error' emit with no listener throw, same as real client

// 1 statement a client got. argc = number of args passed → 1-arg vs 2-arg call distinguishable
export interface ITxCall {
	readonly text: string
	readonly values: readonly unknown[] | undefined
	readonly argc: number
	// index of client = order of checkouts
	readonly client: number
}

// statement answer. Omitted field → default (no rows, no count, first word as tag)
interface ITxAnswer {
	readonly rows?: unknown[]
	readonly rowCount?: number | null
	readonly command?: string
}

// decide answer of a statement: return answer or nothing, or throw, or return promise of either
export type TTxResponder = (call: ITxCall, nth: number) => ITxAnswer | undefined | Promise<ITxAnswer | undefined>

export class FakeTxClient extends EventEmitter implements ITxClient {
	// what release() got, in order
	readonly released: (boolean | undefined)[] = []

	constructor(
		private readonly index: number,
		private readonly world: FakeTxWorld
	) {
		super()
	}

	async query(...args: [string, (readonly unknown[])?]): Promise<{ rows: unknown[]; rowCount: number | null; command: string }> {
		const [text, values] = args
		const call: ITxCall = { text, values, argc: args.length, client: this.index }
		const nth = this.world.calls.length
		this.world.calls.push(call)
		const answer = await this.world.respond(call, nth)
		return {
			rows: answer?.rows ?? [],
			rowCount: answer?.rowCount ?? null,
			command: answer?.command ?? text.split(' ')[0] ?? ''
		}
	}

	release(destroy?: boolean): void {
		this.released.push(destroy)
	}
}

export class FakeTxWorld {
	readonly calls: ITxCall[] = []
	readonly clients: FakeTxClient[] = []
	// set → pool.connect() reject with it
	connectError: unknown
	respond: TTxResponder

	constructor(respond: TTxResponder = () => undefined) {
		this.respond = respond
	}

	readonly pool: ITxPool = {
		connect: () => {
			if (this.connectError !== undefined) {
				// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- world may reject with non-Error on purpose
				return Promise.reject(this.connectError)
			}
			const client = new FakeTxClient(this.clients.length, this)
			this.clients.push(client)
			return Promise.resolve(client)
		}
	}

	// statement texts, in order
	get texts(): string[] {
		return this.calls.map((call) => call.text)
	}
}

// error as driver make it: message, SQLSTATE code, + fields naming objects
export function driverError(code: string, message: string, extra: Record<string, unknown> = {}): Error {
	return Object.assign(new Error(message), { code, ...extra })
}

// responder that throw error() on n-th run of statement text, answer normally otherwise
export function failNth(text: string, runs: readonly number[], error: () => unknown): TTxResponder {
	let seen = 0
	return (call): undefined => {
		if (call.text !== text) return undefined
		seen += 1
		if (runs.includes(seen)) throw error()
		return undefined
	}
}

// settle promise: rejection value, or undefined when it resolve
export function rejection(promise: Promise<unknown>): Promise<unknown> {
	return promise.then(
		() => undefined,
		(error: unknown) => error
	)
}

// everything caller / serialiser / log could show of error, joined. Spec look for planted secret in all at once
export function leakText(error: unknown, calls: readonly ILogCall[]): string {
	const e = error as Error
	return [
		e.message,
		e.stack ?? '',
		JSON.stringify(e),
		String(e),
		inspect(e, { depth: 6, showHidden: true }),
		JSON.stringify(Object.getOwnPropertyDescriptors(e), (_key, value: unknown) => (typeof value === 'function' ? 'fn' : value)),
		JSON.stringify(calls)
	].join('\n')
}
