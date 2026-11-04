import type { ITxClient } from '@lib/PostgreSQL/tx/ITxClient.mjs'

/** What `assertRole` needs of the pool: a checkout (the node-postgres `Pool` has it) and the close. */
export interface IRolePool {
	connect(): Promise<ITxClient>
	end(): Promise<void>
}
