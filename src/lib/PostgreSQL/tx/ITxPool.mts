import type { ITxClient } from '@lib/PostgreSQL/tx/ITxClient.mjs'

/** What `withTx` needs of a pool: the node-postgres `Pool` (made by `createPool`) has it. */
export interface ITxPool {
	connect(): Promise<ITxClient>
}
