import type { ITx } from '@lib/PostgreSQL/tx/ITx.mjs'
import type { ITxResult } from '@lib/PostgreSQL/tx/ITxResult.mjs'

export interface IRecordedCall {
	readonly text: string
	readonly values: readonly unknown[] | undefined
}

// handle w/ query only. Each statement gets next scripted rows. Script used up → fallback rows. Every call recorded
export class RecordingTx implements ITx {
	readonly calls: IRecordedCall[] = []
	// rows once script used up
	fallback: unknown[] = []
	private readonly script: unknown[][]

	constructor(...script: unknown[][]) {
		this.script = script
	}

	query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<ITxResult<TRow>> {
		this.calls.push({ text, values })
		const rows = (this.script.shift() ?? this.fallback) as TRow[]
		return Promise.resolve({ rows, rowCount: rows.length, command: 'SELECT' })
	}

	// text of every statement, in order
	get texts(): string[] {
		return this.calls.map((call) => call.text)
	}
}

// rejection of a promise, or throw if it resolves
export async function failureOf(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise
	} catch (error) {
		return error
	}
	throw new Error('expected the promise to reject')
}

// error a sync call throws, or throw if it returns
export function thrownBy(call: () => unknown): unknown {
	try {
		call()
	} catch (error) {
		return error
	}
	throw new Error('expected the call to throw')
}
