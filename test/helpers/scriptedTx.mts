import type { ITx } from '@lib/PostgreSQL/tx/ITx.mjs'
import type { ITxResult } from '@lib/PostgreSQL/tx/ITxResult.mjs'

// answer of a scripted statement: rows (+ optional count / tag), or an Error to reject with
export type TScriptedAnswer = { readonly rows?: unknown[]; readonly rowCount?: number | null; readonly command?: string } | Error

export interface IScriptedCall {
	readonly text: string
	readonly values: readonly unknown[] | undefined
	// number of args the handle got → 1-arg vs 2-arg call distinguishable
	readonly argc: number
}

// handle w/ query only. Answers given in order, each used once. Out of answers → reject. Record every call
export function scriptedTx(answers: readonly TScriptedAnswer[]): { tx: Pick<ITx, 'query'>; calls: IScriptedCall[] } {
	const calls: IScriptedCall[] = []
	function query<TRow = Record<string, unknown>>(...args: [string, (readonly unknown[])?]): Promise<ITxResult<TRow>> {
		const [text, values] = args
		const answer = answers[calls.length]
		calls.push({ text, values, argc: args.length })
		if (answer === undefined) return Promise.reject(new Error('no answer planned'))
		if (answer instanceof Error) return Promise.reject(answer)
		const rows = (answer.rows ?? []) as TRow[]
		return Promise.resolve({ rows, rowCount: answer.rowCount ?? rows.length, command: answer.command ?? 'SELECT' })
	}
	const tx: Pick<ITx, 'query'> = { query }
	return { tx, calls }
}
