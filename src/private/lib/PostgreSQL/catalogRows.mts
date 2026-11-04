import type { ITxClient } from '@lib/PostgreSQL/tx/ITxClient.mjs'

import type { IRoleRow } from './IRoleRow.mjs'

/**
 * Sends one catalog statement and answers its rows. The statement goes with its values when it has any and without a
 * second argument when it has none. An answer without a list of rows is a malformed answer: it throws, and the check
 * that asked fails, never passes.
 */
export async function catalogRows(client: ITxClient, text: string, values?: readonly unknown[]): Promise<IRoleRow[]> {
	const answer = values === undefined ? await client.query(text) : await client.query(text, values)
	if (!Array.isArray(answer.rows)) throw new TypeError('the catalog answer has no rows')
	return answer.rows as IRoleRow[]
}
